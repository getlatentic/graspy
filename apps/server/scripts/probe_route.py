"""Calls one model on one route many times with the same plain request, to tell
a model's failures from a route's: how often the reply is empty or the call
fails, and how long it takes. Calls go through the repo's LLM client and the
capturing transport of measure_model_compare.py, with the cache off.

    uv run python scripts/probe_route.py --env-file gemma.env \
        --base-url https://bedrock-mantle.us-east-1.api.aws/openai/v1 \
        --prompt-from gemma-text.json --out probe-gemma.json

Two requests, each sent --calls times, six at a time: one short line, and the
first request of a tutor tool step as the tutor sent it (--prompt-from, a result
of measure_model_compare.py in text mode), so the same words go to every model.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from statistics import median

from measure_model_compare import TURNS, CapturingTransport, route_to
from measure_stage_writing import model
from report_model_compare import kind_of

from app.settings import Settings

CONCURRENT = 6
SHORT = [{"role": "user", "content": "Say hello in one short sentence."}]


def tutor_step_messages(path: Path) -> list[dict]:
    """The messages of the first tool-step request in a text-mode result."""
    for row in json.loads(path.read_text())["results"]:
        for turn in row.get("calls", ()):
            for call in turn:
                if kind_of(call) == "tool_step":
                    return call["request"]["messages"]
    raise SystemExit(f"{path} holds no tool-step request.")


async def one(lm, messages: list[dict], gate: asyncio.Semaphore) -> dict:
    async with gate:
        TURNS.set([[]])
        failed = None
        try:
            await lm.acall(messages=messages)
        except Exception as error:  # noqa: BLE001 - a failed call is a result to count
            failed = type(error).__name__
        calls = TURNS.get()[0]
        sent = calls[-1] if calls else {}
        reply = sent.get("reply", {})
        return {
            "failed": failed,
            "status": sent.get("status"),
            "seconds": sent.get("seconds"),
            "empty": not (reply.get("content") or reply.get("tool_calls")),
            "finish_reason": reply.get("finish_reason"),
            "unparsed": reply.get("unparsed"),
            "requests": len(calls),
        }


def summary(rows: list[dict]) -> dict:
    seconds = sorted(r["seconds"] for r in rows if r["seconds"] is not None)
    return {
        "calls": len(rows),
        "failed": sum(r["failed"] is not None for r in rows),
        "failures": sorted({r["failed"] for r in rows if r["failed"]}),
        "empty_replies": sum(r["empty"] for r in rows),
        "status_not_200": sum(r["status"] not in (200, None) for r in rows),
        "no_status": sum(r["status"] is None for r in rows),
        "finish_reasons": {
            str(k): sum(r["finish_reason"] == k for r in rows)
            for k in {r["finish_reason"] for r in rows}
        },
        "seconds_median": median(seconds) if seconds else None,
        "seconds_p90": seconds[int(0.9 * (len(seconds) - 1))] if seconds else None,
        "seconds_max": seconds[-1] if seconds else None,
    }


async def probe(lm, calls: int, step: list[dict]) -> dict:
    gate = asyncio.Semaphore(CONCURRENT)
    out = {}
    for name, messages in (("short line", SHORT), ("tutor tool step", step)):
        rows = await asyncio.gather(*(one(lm, messages, gate) for _ in range(calls)))
        out[name] = {"summary": summary(rows), "rows": rows}
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--base-url")
    parser.add_argument("--prompt-from", type=Path, required=True)
    parser.add_argument("--calls", type=int, default=50)
    parser.add_argument("--out", type=Path, required=True)
    options = parser.parse_args()
    if options.base_url:
        route_to(options.base_url)
    lm = model(Settings(_env_file=options.env_file), CapturingTransport())
    result = asyncio.run(
        probe(lm, options.calls, tutor_step_messages(options.prompt_from))
    )
    options.out.write_text(json.dumps({"model": lm.model, **result}, indent=1))
    for name in ("short line", "tutor tool step"):
        print(lm.model, name, json.dumps(result[name]["summary"]))


if __name__ == "__main__":
    main()
