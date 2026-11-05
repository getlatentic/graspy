"""A turn's events as the frames a client reads, over a socket or server-sent events.

A frame is a JSON object with the seq the event has in its chat and `prev`, the seq of the frame
before it (the client's cursor, for the first). A client keeps the seq of the last frame it applied:
it drops a frame at or below that, and a frame whose `prev` is not its cursor tells it a frame was
lost, so it asks again from its cursor. A cursor beyond the end of the chat, which a client has
after the chat was forgotten, is answered with a `reset` frame."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any

from ..chatlog import kinds
from ..chatlog.log import PAGE, ChatLog, Event
from .relay import SHOWN, follow

RESET: dict[str, Any] = {"kind": "reset"}

# What each shown kind tells a client, besides where it falls.
_FIELDS: dict[str, tuple[str, ...]] = {
    kinds.TEXT: ("text",),
    kinds.ROUND_ABORTED: ("reason",),
    kinds.TOOL_STARTED: ("tool",),
    kinds.TOOL: ("tool",),
    kinds.TOOL_CANCELLED: ("tool",),
    kinds.TURN_RESUMED: (),
    kinds.TURN_FINISHED: ("status", "cause", "reply"),
}


def frame(event: Event, prev: int) -> dict[str, Any]:
    fields = {
        name: event.data[name] for name in _FIELDS[event.kind] if name in event.data
    }
    return {"seq": event.seq, "prev": prev, "kind": event.kind, **fields}


def is_last(frame_: dict[str, Any]) -> bool:
    return frame_["kind"] == kinds.TURN_FINISHED


async def pending(log: ChatLog, chat: str, turn: str, after: int) -> list[dict]:
    """The frames of `turn` kept after seq `after`, at once: the turn's end is the last, if it came."""
    frames: list[dict] = []
    prev = after
    while True:
        page = await log.since(chat, after, PAGE, SHOWN)
        for event in page:
            after = event.seq
            if event.data.get("turn") == turn:
                frames.append(frame(event, prev))
                prev = event.seq
        if len(page) < PAGE:
            return frames


async def read(
    log: ChatLog,
    chat: str,
    turn: str,
    after: int,
    deadline_ms: int,
    clock: Callable[[], int] | None = None,
) -> AsyncIterator[dict]:
    """The frames of `turn` after `after` as they are kept, the last being its end, or `reset` if
    the chat does not reach `after`. Raises TimeoutError when the turn is not finished in
    `deadline_ms`."""
    if after > await log.last_seq(chat):
        yield RESET
        return
    prev = after
    options = {} if clock is None else {"clock": clock}
    async for event in follow(
        log, chat, turn, after, deadline_ms=deadline_ms, **options
    ):
        yield frame(event, prev)
        prev = event.seq
