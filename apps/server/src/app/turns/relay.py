"""Reading a turn as it happens: the events its runs keep, in order, until the turn is finished.

The reader holds nothing the log does not: a request that is cut off, or a second reader of the same
turn, sees the same events."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable

from ..chatlog import kinds
from ..chatlog.log import PAGE, ChatLog, Event
from ..learner.time import now_ms
from .rules import MAX_TURN_MS, WATCHDOG_MS

SHOWN = (
    kinds.TEXT,
    kinds.ROUND_ABORTED,
    kinds.TOOL_STARTED,
    kinds.TOOL,
    kinds.TURN_RESUMED,
    kinds.TURN_FINISHED,
)
POLL_MS = 150
# A turn is given up on by MAX_TURN_MS after it began, so a reader that waits this long has seen it end.
FOLLOW_DEADLINE_MS = MAX_TURN_MS + 2 * WATCHDOG_MS


async def follow(
    log: ChatLog,
    chat: str,
    turn: str,
    after: int,
    *,
    clock: Callable[[], int] = now_ms,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    deadline_ms: int = FOLLOW_DEADLINE_MS,
) -> AsyncIterator[Event]:
    """The events of `turn` after seq `after`, the last being its `turn.finished`. Raises TimeoutError
    when the turn is not finished within `deadline_ms`."""
    stop = clock() + deadline_ms
    while True:
        page = await log.since(chat, after, PAGE, SHOWN)
        for event in page:
            after = event.seq
            if event.data.get("turn") != turn:
                continue
            yield event
            if event.kind == kinds.TURN_FINISHED:
                return
        if len(page) == PAGE:
            continue
        if clock() >= stop:
            raise TimeoutError(f"Turn {turn} is not finished")
        await sleep(POLL_MS / 1000)
