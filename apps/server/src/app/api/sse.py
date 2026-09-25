from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator

from fastapi import HTTPException
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

# Generation runs for minutes; idle proxies close a silent connection sooner.
HEARTBEAT_SECONDS = 20

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    # nginx would otherwise buffer the whole stream and deliver it at the end.
    "X-Accel-Buffering": "no",
}


def _error_event(message: str) -> dict[str, str]:
    return {
        "event": "message",
        "data": json.dumps({"type": "error", "phase": "error", "message": message}),
    }


async def _publish(
    events: AsyncIterator[str], fallback_message: str
) -> AsyncIterator[dict[str, str]]:
    queue: asyncio.Queue[dict[str, str] | None] = asyncio.Queue()

    async def pump() -> None:
        try:
            async for event in events:
                await queue.put({"event": "message", "data": event})
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else fallback_message
            await queue.put(_error_event(detail))
        except Exception:
            # Provider errors carry model ids, upstream URLs and sometimes
            # credential fragments, so the client gets the generic message.
            logger.exception("Stream failed: %s", fallback_message)
            await queue.put(_error_event(fallback_message))
        finally:
            await queue.put(None)

    async def heartbeat() -> None:
        with contextlib.suppress(asyncio.CancelledError):
            while True:
                await asyncio.sleep(HEARTBEAT_SECONDS)
                await queue.put({"event": "ping", "data": "keepalive"})

    producer = asyncio.create_task(pump())
    pinger = asyncio.create_task(heartbeat())
    try:
        while (item := await queue.get()) is not None:
            yield item
        yield {"data": "[DONE]"}
    finally:
        # A disconnected client must not leave the model call running.
        for task in (producer, pinger):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


def sse_response(
    events: AsyncIterator[str], fallback_message: str
) -> EventSourceResponse:
    """JSON strings as SSE, ending in an error event rather than a dropped
    connection, which a browser cannot tell from a slow one."""
    return EventSourceResponse(_publish(events, fallback_message), headers=SSE_HEADERS)
