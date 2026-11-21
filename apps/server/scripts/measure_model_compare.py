"""Runs measure_skill_loading's cases on one model and keeps every model call
of every turn as it went over the wire: the reply, finish_reason, usage and
latency. The model is the only thing that changes between two runs: it is
LLM_MODEL_ID in the env file.

    uv run python scripts/measure_model_compare.py --env-file oss.env --out oss.json
    uv run python scripts/measure_model_compare.py --env-file gemma.env --out gemma.json
    uv run python scripts/measure_model_compare.py --env-file gemma.env --out one.json \
        --only calculate --draws 1 --ladder-draws 1

DSPy's cache is off. A key never reaches the output: only request bodies and
reply bodies are kept.
"""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import dataclasses
import json
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

import measure_skill_loading as base
from dspy.lm15 import RouterConfig
from measure_stage_writing import model
from wire_record import RecordingTransport, message_of

from app.llm import hosts
from app.settings import Settings

# The model calls of the draw being run, one list per turn, in order.
TURNS: contextvars.ContextVar[list[list[dict]]] = contextvars.ContextVar("turns")


class CapturingTransport(RecordingTransport):
    """Keeps each request and the whole reply of every model call, and feeds
    the same call to wire_record, which reads the tutor's calls off the bytes."""

    @asynccontextmanager
    async def stream(self, request):
        call = {"request": json.loads(request.body), "status": None}
        started = time.perf_counter()
        chunks: list[bytes] = []
        try:
            async with super().stream(request) as response:
                call["status"] = response.status

                async def tee():
                    async for chunk in inner:
                        chunks.append(chunk)
                        yield chunk

                inner = response._chunks
                response._chunks = tee()
                yield response
        except BaseException as error:
            # A call that was cancelled or failed before its reply is kept too.
            call["raised"] = type(error).__name__
            raise
        finally:
            call["seconds"] = round(time.perf_counter() - started, 2)
            try:
                call["reply"] = parse_reply(b"".join(chunks))
            except ValueError:
                call["reply"] = {
                    "unparsed": b"".join(chunks)[:400].decode("utf-8", "replace")
                }
            turns = TURNS.get(None)
            if turns:
                turns[-1].append(call)


def parse_reply(raw: bytes) -> dict:
    """Content, reasoning, finish_reason and usage of a streamed or whole
    chat completion; a failure keeps the start of its body."""
    text = raw.decode("utf-8", "replace")
    events = [
        line[len("data:") :].strip()
        for line in text.splitlines()
        if line.startswith("data:")
    ]
    if not events:
        try:
            events = [json.dumps(json.loads(text))]
        except json.JSONDecodeError:
            return {"unparsed": text[:400]}
    reply = {"content": "", "reasoning": "", "finish_reason": None, "usage": None}
    for event in events:
        if event == "[DONE]":
            continue
        data = json.loads(event)
        reply["usage"] = data.get("usage") or reply["usage"]
        for choice in data.get("choices", ()):
            part = choice.get("delta") or choice.get("message") or {}
            reply["content"] += part.get("content") or ""
            reply["reasoning"] += (
                part.get("reasoning") or part.get("reasoning_content") or ""
            )
            reply["finish_reason"] = (
                choice.get("finish_reason") or reply["finish_reason"]
            )
            if part.get("tool_calls"):
                reply["native_tool_calls"] = True
    reply["tool_calls"] = message_of(raw)["tool_calls"]
    return reply


class WireTutor(base.Tutor):
    """Opens a new list of calls when a turn starts."""

    async def stream(self, *args, **kwargs):
        TURNS.get().append([])
        async for item in super().stream(*args, **kwargs):
            yield item


def route_to(base_url: str) -> None:
    """Sends Bedrock's calls to another base URL with the same key. Gemma 4 is
    served at /openai/v1 of the mantle host (gpt-oss at /v1), and lm15 builds
    the mantle route's URL itself, so the call goes by its plain
    Chat Completions route, as the Workers AI host's does."""
    host = hosts.HOSTS["bedrock"]

    def config(settings, transport):
        return RouterConfig(
            api_keys={"openai-chat": settings.aws_bearer_token_bedrock},
            base_urls={"openai-chat": base_url},
            transport=transport,
        )

    hosts.HOSTS["bedrock"] = dataclasses.replace(
        host, provider="openai-chat", config=config
    )


def wired(draw):
    async def run(case, lm):
        TURNS.set([])
        try:
            result = await draw(case, lm)
        except Exception as error:  # noqa: BLE001 - a failed turn is a result to count
            # The calls made before it failed are what says why.
            return {
                "case": case[0],
                "group": case[1],
                "error": repr(error)[:300],
                "trace": "".join(traceback.format_exception(error))[-2000:],
                "calls": TURNS.get(),
            }
        result["calls"] = TURNS.get()
        return result

    return run


async def measure_with_wire(lm, draws: int, ladder_draws: int, only: set[str]):
    kept = [case for case in base.CASES if not only or case[0] in only]
    base.CASES[:] = kept
    return await base.measure(lm, draws, ladder_draws)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--draws", type=int, default=10)
    parser.add_argument("--ladder-draws", type=int, default=10)
    parser.add_argument("--base-url")
    parser.add_argument("--only", action="append", default=[])
    options = parser.parse_args()
    settings = Settings(_env_file=options.env_file)
    if options.base_url:
        route_to(options.base_url)
    base.record_skill_loads()
    base.check_the_tutor(False)
    base.Tutor = WireTutor
    base.draw = wired(base.draw)
    lm = model(settings, CapturingTransport())
    results = asyncio.run(
        measure_with_wire(lm, options.draws, options.ladder_draws, set(options.only))
    )
    options.out.write_text(
        json.dumps({"model": lm.model, "results": results}, indent=1)
    )
    print(lm.model, len(results), "conversations")


if __name__ == "__main__":
    main()
