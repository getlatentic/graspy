"""The helper that carries every stream."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import HTTPException

from app.api import sse
from app.api.sse import _publish, sse_response

FALLBACK = "Generation failed"


async def _drain(produce, fallback=FALLBACK) -> list[dict]:
    return [event async for event in _publish(produce(), fallback)]


def _payloads(events: list[dict]) -> list[dict]:
    """The JSON bodies, ignoring the terminator and any heartbeat."""
    return [
        json.loads(event["data"]) for event in events if event.get("event") == "message"
    ]


async def test_events_reach_the_client_in_order():
    async def produce() -> AsyncIterator[str]:
        for index in range(3):
            yield json.dumps({"n": index})

    events = await _drain(produce)

    assert [payload["n"] for payload in _payloads(events)] == [0, 1, 2]


async def test_an_empty_producer_still_terminates():
    """A generation that produces nothing must not hang the browser."""

    async def produce() -> AsyncIterator[str]:
        return
        yield  # pragma: no cover - makes this an async generator

    assert await _drain(produce) == [{"data": "[DONE]"}]


async def test_a_failure_arrives_as_an_error_event_not_a_dropped_connection():
    """A browser cannot tell a dropped stream from a slow one."""

    async def produce() -> AsyncIterator[str]:
        yield json.dumps({"n": 1})
        raise RuntimeError("provider exploded")

    events = await _drain(produce)
    payloads = _payloads(events)

    assert payloads[0] == {"n": 1}
    assert payloads[-1]["type"] == "error"
    assert payloads[-1]["phase"] == "error"
    assert events[-1] == {"data": "[DONE]"}


async def test_the_exception_text_is_not_sent_to_the_client():
    """Provider errors carry model ids, upstream URLs and sometimes fragments
    of credentials, and anyone who can mint a session reaches this."""

    async def produce() -> AsyncIterator[str]:
        raise RuntimeError("sk-or-v1-secret leaked via https://internal.host")
        yield  # pragma: no cover

    payloads = _payloads(await _drain(produce))

    assert payloads[-1]["message"] == FALLBACK
    assert "sk-or-v1" not in json.dumps(payloads)
    assert "internal.host" not in json.dumps(payloads)


async def test_the_failure_is_logged_in_full(caplog):
    async def produce() -> AsyncIterator[str]:
        raise RuntimeError("provider exploded")
        yield  # pragma: no cover

    with caplog.at_level("ERROR"):
        await _drain(produce)

    assert f"Stream failed: {FALLBACK}" in caplog.messages
    assert "provider exploded" in caplog.text


async def test_an_http_exception_keeps_its_own_message():
    """A 400 says something the learner can act on, unlike a provider crash."""

    async def produce() -> AsyncIterator[str]:
        raise HTTPException(status_code=400, detail="Pick a country first")
        yield  # pragma: no cover

    payloads = _payloads(await _drain(produce))

    assert payloads[-1]["message"] == "Pick a country first"


async def test_a_structured_http_detail_falls_back_to_the_generic_message():
    async def produce() -> AsyncIterator[str]:
        raise HTTPException(status_code=400, detail={"error": "structured"})
        yield  # pragma: no cover

    payloads = _payloads(await _drain(produce))

    assert payloads[-1]["message"] == FALLBACK


async def test_a_heartbeat_keeps_an_idle_stream_open(monkeypatch):
    """Without this an idle proxy closes the connection mid-lesson."""
    monkeypatch.setattr(sse, "HEARTBEAT_SECONDS", 0.01)

    async def produce() -> AsyncIterator[str]:
        await asyncio.sleep(0.05)
        yield json.dumps({"n": 1})

    events = await _drain(produce)

    assert {"event": "ping", "data": "keepalive"} in events
    assert [payload["n"] for payload in _payloads(events)] == [1]


async def test_abandoning_the_stream_stops_the_producer():
    """A learner who navigates away must not leave a model call running."""
    cancelled = asyncio.Event()

    async def produce() -> AsyncIterator[str]:
        try:
            for index in range(1000):
                yield json.dumps({"n": index})
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    stream = _publish(produce(), FALLBACK)
    await stream.__anext__()
    await stream.aclose()

    await asyncio.wait_for(cancelled.wait(), timeout=2)


async def test_abandoning_the_stream_stops_the_heartbeat(monkeypatch):
    monkeypatch.setattr(sse, "HEARTBEAT_SECONDS", 0.01)
    before = len(asyncio.all_tasks())

    async def produce() -> AsyncIterator[str]:
        yield json.dumps({"n": 1})
        await asyncio.sleep(5)

    stream = _publish(produce(), FALLBACK)
    await stream.__anext__()
    await stream.aclose()
    await asyncio.sleep(0.05)

    assert len(asyncio.all_tasks()) <= before


async def test_sse_response_tells_the_client_its_own_failure_message():
    async def produce() -> AsyncIterator[str]:
        raise RuntimeError("provider exploded")
        yield  # pragma: no cover

    events = [
        event
        async for event in sse_response(produce(), "Lesson stream failed").body_iterator
    ]

    assert _payloads(events)[-1]["message"] == "Lesson stream failed"
