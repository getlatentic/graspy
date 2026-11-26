"""Where the tutor keeps each conversation between turns: a Durable Object
per conversation on a Worker, whose isolates come and go, and a dict locally.
Both change the stored JSON through the functions at the end of this module,
so the Durable Object holds no logic of its own."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, NotRequired, Protocol, TypedDict

# The prompt carries at most this many exchanges; past it, the oldest are
# folded into the conversation's summary, keeping this many after the fold.
MAX_EXCHANGES = 20
KEPT_AFTER_FOLD = 10
# A store never holds more, whether or not a fold has happened: a fold that
# keeps failing must not let a conversation grow without end.
MAX_STORED = 40


class Exchange(TypedDict):
    message: str
    answer: str
    # A card's question is not in the answer's words; kept here, the tutor
    # knows later what it asked and how the learner did.
    app: NotRequired[str]
    card: NotRequired[str]
    # The skills in effect after this turn, each with the turns since it was
    # loaded, and the topic they are for: the next turn carries them on.
    skills: NotRequired[dict[str, int]]
    topic: NotRequired[str]
    # How many About you forms the learner has been shown and left unanswered, counted up to this
    # exchange. It rides on every exchange from the first form, so it survives the oldest being
    # trimmed or folded away.
    forms: NotRequired[int]


@dataclass(frozen=True)
class Conversation:
    summary: str = ""
    exchanges: tuple[Exchange, ...] = ()


class ConversationStore(Protocol):
    async def load(
        self, conversation_id: str, excluding_turn: str | None = None
    ) -> Conversation:
        """`excluding_turn` leaves out the exchange that turn kept, in a store that knows its turns
        (the others ignore it): a turn run again is not made to read its own earlier run."""
        ...

    async def append(
        self, conversation_id: str, exchange: Exchange, turn: str | None = None
    ) -> None:
        """`turn` names the turn the exchange answers: a store that keeps it once per turn is not
        made to keep it twice by a turn that is run again; the others ignore it."""
        ...

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        """Drops the oldest `dropped` exchanges, which `summary` covers;
        any added since the load are kept."""
        ...

    async def forget(self, conversation_id: str) -> None: ...


class InMemoryConversationStore:
    def __init__(self) -> None:
        self._stored: dict[str, str] = {}

    async def load(
        self, conversation_id: str, excluding_turn: str | None = None
    ) -> Conversation:
        return parsed(self._stored.get(conversation_id), excluding_turn)

    async def append(
        self, conversation_id: str, exchange: Exchange, turn: str | None = None
    ) -> None:
        self._stored[conversation_id] = appended(
            self._stored.get(conversation_id), json.dumps(_with_turn(exchange, turn))
        )

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        self._stored[conversation_id] = folded(
            self._stored.get(conversation_id), summary, dropped
        )

    async def forget(self, conversation_id: str) -> None:
        self._stored.pop(conversation_id, None)


class DurableObjectConversationStore:
    """Values cross into the Durable Object as JSON text, which needs no
    conversion between Python and JavaScript."""

    def __init__(self, namespace: Any) -> None:
        self._namespace = namespace

    async def load(
        self, conversation_id: str, excluding_turn: str | None = None
    ) -> Conversation:
        return parsed(
            await self._namespace.getByName(conversation_id).load(), excluding_turn
        )

    async def append(
        self, conversation_id: str, exchange: Exchange, turn: str | None = None
    ) -> None:
        await self._namespace.getByName(conversation_id).append(
            json.dumps(_with_turn(exchange, turn))
        )

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        await self._namespace.getByName(conversation_id).fold(summary, dropped)

    async def forget(self, conversation_id: str) -> None:
        await self._namespace.getByName(conversation_id).forget()


def _stored(stored: str | None) -> dict:
    """One stored before summaries is a list."""
    value = json.loads(stored or "[]")
    if isinstance(value, list):
        return {"summary": "", "exchanges": value}
    return value


def _with_turn(exchange: Exchange, turn: str | None) -> dict:
    """What a store that keeps turn ids writes: the exchange with its turn, which `parsed` takes
    out again."""
    return {**exchange, "turn": turn} if turn else dict(exchange)


def parsed(stored: str | None, excluding_turn: str | None = None) -> Conversation:
    """The conversation as stored. Each exchange's turn id is not part of it; the one of
    `excluding_turn` is left out, so a turn run again does not read its own earlier run."""
    value = _stored(stored)
    kept = [
        {k: v for k, v in exchange.items() if k != "turn"}
        for exchange in value["exchanges"]
        if excluding_turn is None or exchange.get("turn") != excluding_turn
    ]
    return Conversation(value["summary"], tuple(kept))


def appended(stored: str | None, exchange_json: str) -> str:
    """The exchange added, unless one of its turn is there already: a turn run again does not
    keep its exchange twice."""
    value = _stored(stored)
    exchange = json.loads(exchange_json)
    turn = exchange.get("turn")
    if turn and any(kept.get("turn") == turn for kept in value["exchanges"]):
        return json.dumps(value)
    exchanges = [*value["exchanges"], exchange][-MAX_STORED:]
    return json.dumps({"summary": value["summary"], "exchanges": exchanges})


def folded(stored: str | None, summary: str, dropped: int) -> str:
    value = _stored(stored)
    # From a Durable Object call, a whole number can arrive as a float.
    kept = value["exchanges"][int(dropped) :]
    return json.dumps({"summary": summary, "exchanges": kept})
