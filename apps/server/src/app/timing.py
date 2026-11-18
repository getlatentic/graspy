"""Where a request's time went, sent back as a `Server-Timing` header.

A request names the spans it spent time in (`async with span("learner_do")`), and the
middleware adds the total and whether this was the instance's first request. The header
carries durations and fixed names only, never a learner's text or id. The browser shows it in
its network panel and the page can read it from Resource Timing."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar

_spans: ContextVar[dict[str, float] | None] = ContextVar("timing_spans", default=None)

# Set once the instance has answered a request: the first one pays for building the app.
_answered = False
_started = time.monotonic()
_build_ms = 0.0


def note_build(seconds: float) -> None:
    """The time the instance spent building the app, reported with its first request."""
    global _build_ms
    _build_ms = seconds * 1000


@asynccontextmanager
async def span(name: str) -> AsyncIterator[None]:
    """Adds the time spent inside to the request's `name`; outside a request it only runs."""
    begun = time.monotonic()
    try:
        yield
    finally:
        spans = _spans.get()
        if spans is not None:
            spans[name] = spans.get(name, 0.0) + (time.monotonic() - begun) * 1000


def _header(spans: dict[str, float], total_ms: float, first: bool) -> bytes:
    parts = [f"total;dur={total_ms:.0f}"]
    parts += [f"{name};dur={ms:.0f}" for name, ms in spans.items()]
    if first:
        parts.append(f'first;desc="first request of this instance";dur={_build_ms:.0f}')
    return ", ".join(parts).encode()


class ServerTimingMiddleware:
    """Raw ASGI, so a streamed response passes through unbuffered. The header goes on the
    response start, so it holds the time to the first byte, which is what a page waits on."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        global _answered
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        first, _answered = not _answered, True
        spans: dict[str, float] = {}
        token = _spans.set(spans)
        begun = time.monotonic()

        async def send_timed(message) -> None:
            if message["type"] == "http.response.start":
                total = (time.monotonic() - begun) * 1000
                message = {
                    **message,
                    "headers": [
                        *message.get("headers", []),
                        (b"server-timing", _header(spans, total, first)),
                        (b"timing-allow-origin", b"*"),
                    ],
                }
            await send(message)

        try:
            await self.app(scope, receive, send_timed)
        finally:
            _spans.reset(token)
