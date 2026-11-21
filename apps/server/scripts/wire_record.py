"""Records the requests the tutor sends to the model and the replies it gets,
and reads each tutor call off the bytes: what the request offered, what came
back, and what went wrong in it. A reading here is of the wire, not of what
DSPy made of it."""

from __future__ import annotations

import contextvars
import json
import re
import time
from contextlib import asynccontextmanager

from dspy._vendor.lm15.transports._types import AsyncTransportResponse

from app.llm.transport import HttpxTransport

# The calls of the turn being run, set by whoever runs the turn.
CALLS: contextvars.ContextVar[list[dict]] = contextvars.ContextVar("calls")

TEXT_TOOL = re.compile(r"\[\[ ## next_tool_name ## \]\]\s*(\S+)")
TEXT_ARGS = re.compile(
    r"\[\[ ## next_tool_args ## \]\]\s*(.*?)\s*(?:\[\[ ## completed|\Z)", re.DOTALL
)
# Vendor tool markup and DSPy's field markers have no place in a native reply.
MARKUP = re.compile(r"<\|[a-z_]+\||\[\[ ## ")


_NO_MESSAGE = {"content": "", "tool_calls": [], "finish_reason": None, "usage": {}}


class RecordingTransport(HttpxTransport):
    """Keeps each request body, and the reply with how long it took."""

    def __init__(self) -> None:
        super().__init__()
        self.bodies: list[dict] = []

    @asynccontextmanager
    async def stream(self, request):
        record = {
            "request": json.loads(request.body),
            "reply": bytearray(),
            "started": time.perf_counter(),
        }
        self.bodies.append(record["request"])
        if (calls := CALLS.get(None)) is not None:
            calls.append(record)
        async with super().stream(request) as response:
            chunks = response._chunks

            async def tapped():
                try:
                    async for chunk in chunks:
                        record["reply"] += chunk
                        yield chunk
                    record["completed"] = True
                finally:
                    record["seconds"] = time.perf_counter() - record["started"]

            yield AsyncTransportResponse(
                status=response.status,
                reason=response.reason,
                headers=response.headers,
                http_version=response.http_version,
                chunks=tapped(),
                release=response._release,
            )


def message_of(reply: bytes) -> dict:
    """The one assistant message of a reply, whether it was streamed or not."""
    text = reply.decode("utf-8", "replace")
    if not text.strip():
        # The tutor closes a streamed answer it has no more use for.
        return dict(_NO_MESSAGE)
    if not text.lstrip().startswith("data:"):
        try:
            body = json.loads(text)
            choice = body["choices"][0]
        except ValueError, KeyError, IndexError, TypeError:
            # A provider that refuses a request answers with its own error body.
            return {**_NO_MESSAGE, "provider_error": text[:500]}
        return {
            "content": choice["message"].get("content") or "",
            "tool_calls": choice["message"].get("tool_calls") or [],
            "finish_reason": choice["finish_reason"],
            "usage": body.get("usage") or {},
        }
    content, calls, finish, usage = [], {}, None, {}
    for line in text.splitlines():
        if not line.startswith("data:") or line.strip() == "data: [DONE]":
            continue
        event = json.loads(line[5:])
        usage = event.get("usage") or usage
        for choice in event.get("choices", []):
            delta = choice.get("delta") or {}
            content.append(delta.get("content") or "")
            for piece in delta.get("tool_calls") or []:
                call = calls.setdefault(
                    piece["index"], {"function": {"name": "", "arguments": ""}}
                )
                call["function"]["name"] += piece.get("function", {}).get("name") or ""
                call["function"]["arguments"] += (
                    piece.get("function", {}).get("arguments") or ""
                )
            finish = choice.get("finish_reason") or finish
    return {
        "content": "".join(content),
        "tool_calls": list(calls.values()),
        "finish_reason": finish,
        "usage": usage,
    }


def kind_of(request: dict) -> str:
    """The tutor's tool step is the call that offers tools, as a native tools
    array or as text in the system message."""
    system = request["messages"][0]["content"]
    if "tools" in request or "next_tool_name" in system:
        return "tool_step"
    if request.get("stream"):
        return "answer"
    return "other"


def read_call(record: dict, known: set[str]) -> dict:
    request = record["request"]
    message = message_of(bytes(record["reply"]))
    kind = kind_of(request)
    called, problems, bad = [], [], []
    if message["tool_calls"]:
        for call in message["tool_calls"]:
            name = call["function"]["name"]
            called.append(name)
            try:
                json.loads(call["function"]["arguments"] or "{}", strict=False)
            except ValueError as error:
                problems.append("malformed_arguments")
                bad.append(f"{error}: {call['function']['arguments'][:200]!r}")
            if name not in known:
                problems.append("unknown_tool")
    elif kind == "tool_step" and (found := TEXT_TOOL.search(message["content"])):
        called.append(found.group(1))
        arguments = TEXT_ARGS.search(message["content"])
        try:
            json.loads(arguments.group(1) if arguments else "{}", strict=False)
        except ValueError as error:
            problems.append("malformed_arguments")
            bad.append(f"{error}: {arguments.group(1)[:200]!r}")
        if found.group(1) not in known:
            problems.append("unknown_tool")
    elif kind == "tool_step" and "tools" not in request:
        problems.append("no_call_in_reply")
    if kind == "tool_step" and "tools" in request and not message["tool_calls"]:
        if MARKUP.search(message["content"]):
            problems.append("markup_instead_of_call")
        if not message["content"].strip():
            problems.append("empty_reply")
    if message["finish_reason"] == "length":
        problems.append("length")
    usage = message["usage"]
    return {
        "kind": kind,
        "tools_on_wire": [t["function"]["name"] for t in request.get("tools", [])],
        "tool_choice": request.get("tool_choice"),
        "asks_for_thought": "next_thought" in json.dumps(request["messages"][-1]),
        "called": called,
        "finish_reason": message["finish_reason"],
        "problems": problems,
        "bad_arguments": bad,
        "seconds": round(record.get("seconds", 0.0), 2),
        "closed_early": not record.get("completed", False),
        "provider_error": message.get("provider_error"),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
    }


def read_calls(records: list[dict], known: set[str]) -> list[dict]:
    return [
        call
        for record in records
        if (call := read_call(record, known))["kind"] != "other"
    ]
