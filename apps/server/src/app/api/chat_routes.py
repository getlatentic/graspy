"""A learner's tutor turns, started, read and stopped over REST: a turn outlives the request that
started it (turns/), so reading it is a request of its own, and one that can be made again from
where the last ended.

    POST /chats/{chat}/turns              begins a turn, or joins it if the id was sent before
    GET  /chats/{chat}/turns/{turn}/events   its frames after a cursor, as server-sent events
    POST /chats/{chat}/turns/{turn}/stop  ends it with the words it has

The frames are those of turns/frames.py. The same frames come over a WebSocket held by the chat's
Durable Object (worker.py); server-sent events are the way in when a socket cannot be opened."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..security.guard import Session, require_session
from ..turns.access import may_follow, may_start
from ..turns.durable import DurableTurns
from ..turns.frames import read
from ..turns.job import MAX_MESSAGE_CHARS, TurnJob
from .sse import SSE_HEADERS

# A window of reading, after which the client asks again from its cursor: a request that reads the
# log for as long as a turn can last would spend the Worker's limit on queries.
WINDOW_MS = 20_000
ID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"
MAX_PARTS = 4

chat_router = APIRouter(prefix="/chats", tags=["chat"])

ChatId = Annotated[str, Path(pattern=ID_PATTERN)]
TurnId = Annotated[str, Path(pattern=ID_PATTERN)]


class StartTurn(BaseModel):
    """`parts` and `metadata` are the A2A message's: the learner's words and app calls, and the
    learner's situation under "learner"."""

    # The message's id, which names the turn: a start sent again joins the turn it began.
    turn: str = Field(pattern=ID_PATTERN)
    parts: list[dict[str, Any]] = Field(max_length=MAX_PARTS)
    metadata: dict[str, Any] = Field(default_factory=dict)


class StartedTurn(BaseModel):
    turn: str
    # The seq to read from: the frames of the turn follow it.
    cursor: int


def _turns(request: Request) -> DurableTurns:
    turns = request.app.state.turns
    if turns is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "Turns are not kept on this server",
                "code": "turns_unavailable",
            },
        )
    return turns


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=404, detail={"error": "No such chat", "code": "chat_not_found"}
    )


def _message(parts: list[dict[str, Any]]) -> str:
    text = "\n".join(
        part["text"] for part in parts if isinstance(part.get("text"), str)
    )
    if not text.strip():
        raise HTTPException(
            status_code=422, detail={"error": "Say something", "code": "empty_message"}
        )
    if len(text) > MAX_MESSAGE_CHARS:
        raise HTTPException(
            status_code=422,
            detail={"error": "That message is too long", "code": "message_too_long"},
        )
    return text


@chat_router.post("/{chat}/turns")
async def start_turn(
    chat: ChatId,
    body: StartTurn,
    session: Annotated[Session, Depends(require_session)],
    request: Request,
) -> StartedTurn:
    turns = _turns(request)
    if not await may_start(turns.log, chat, session.learner):
        raise _not_found()
    job = TurnJob(
        chat=chat,
        turn=body.turn,
        learner=session.learner,
        message=_message(body.parts),
        parts=body.parts,
        metadata=body.metadata,
    )
    try:
        return StartedTurn(turn=body.turn, cursor=await turns.host.start(job))
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail={"error": "That message is too large", "code": "turn_too_large"},
        ) from None


def _event(frame: dict[str, Any]) -> str:
    identified = f"id: {frame['seq']}\n" if "seq" in frame else ""
    return f"{identified}data: {json.dumps(frame, separators=(',', ':'))}\n\n"


async def _stream(
    turns: DurableTurns, chat: str, turn: str, after: int
) -> AsyncIterator[str]:
    # Sent first, so the client knows the connection is open before the turn has anything to say.
    yield ": open\n\n"
    try:
        async for frame in read(turns.log, chat, turn, after, WINDOW_MS):
            yield _event(frame)
    except TimeoutError:
        return


@chat_router.get("/{chat}/turns/{turn}/events")
async def turn_events(
    chat: ChatId,
    turn: TurnId,
    session: Annotated[Session, Depends(require_session)],
    request: Request,
    last_event_id: Annotated[int | None, Header(ge=0)] = None,
    after: Annotated[int | None, Query(ge=0)] = None,
) -> StreamingResponse:
    """The frames after the cursor: `Last-Event-ID`, which a reconnecting client sends, or `after`."""
    turns = _turns(request)
    if not await may_follow(turns.log, chat, session.learner):
        raise _not_found()
    cursor = last_event_id if last_event_id is not None else after or 0
    return StreamingResponse(
        _stream(turns, chat, turn, cursor),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@chat_router.post("/{chat}/turns/{turn}/stop", status_code=204)
async def stop_turn(
    chat: ChatId,
    turn: TurnId,
    session: Annotated[Session, Depends(require_session)],
    request: Request,
) -> None:
    turns = _turns(request)
    if not await may_follow(turns.log, chat, session.learner):
        raise _not_found()
    await turns.host.stop(chat, turn)
