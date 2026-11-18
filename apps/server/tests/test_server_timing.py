"""The Server-Timing header names where a request's time went, and carries no learner data."""

from __future__ import annotations

import asyncio

from app import timing
from app.timing import ServerTimingMiddleware, span


async def _call(app) -> list[tuple[bytes, bytes]]:
    sent: list[dict] = []

    async def receive():
        return {"type": "http.request"}

    async def send(message):
        sent.append(message)

    await ServerTimingMiddleware(app)(
        {"type": "http", "path": "/api/learner", "headers": []}, receive, send
    )
    return next(m for m in sent if m["type"] == "http.response.start")["headers"]


async def _slow_app(scope, receive, send):
    async with span("learner_do"):
        await asyncio.sleep(0.02)
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b""})


def _timing(headers) -> dict[str, float]:
    value = dict(headers)[b"server-timing"].decode()
    return {
        part.split(";")[0]: float(part.split("dur=")[1])
        for part in value.split(", ")
        if "dur=" in part
    }


def test_header_names_the_span_and_the_total() -> None:
    timing._answered = True
    headers = asyncio.run(_call(_slow_app))
    spans = _timing(headers)
    assert 15 <= spans["learner_do"] <= spans["total"]
    assert "first" not in spans


def test_only_the_first_request_of_an_instance_says_so() -> None:
    timing._answered = False
    timing.note_build(1.5)
    first = _timing(asyncio.run(_call(_slow_app)))
    second = _timing(asyncio.run(_call(_slow_app)))
    assert first["first"] == 1500
    assert "first" not in second


def test_a_span_outside_a_request_only_runs() -> None:
    async def run() -> int:
        async with span("anywhere"):
            return 1

    assert asyncio.run(run()) == 1
