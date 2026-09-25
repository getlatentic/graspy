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


@dataclass(frozen=True)
class Conversation:
    summary: str = ""
    exchanges: tuple[Exchange, ...] = ()


class ConversationStore(Protocol):
    async def load(self, conversation_id: str) -> Conversation: ...

    async def append(self, conversation_id: str, exchange: Exchange) -> None: ...

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        """Drops the oldest `dropped` exchanges, which `summary` covers;
        any added since the load are kept."""
        ...


class InMemoryConversationStore:
    def __init__(self) -> None:
        self._stored: dict[str, str] = {}

    async def load(self, conversation_id: str) -> Conversation:
        return parsed(self._stored.get(conversation_id))

    async def append(self, conversation_id: str, exchange: Exchange) -> None:
        self._stored[conversation_id] = appended(
            self._stored.get(conversation_id), json.dumps(exchange)
        )

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        self._stored[conversation_id] = folded(
            self._stored.get(conversation_id), summary, dropped
        )


class DurableObjectConversationStore:
    """Values cross into the Durable Object as JSON text, which needs no
    conversion between Python and JavaScript."""

    def __init__(self, namespace: Any) -> None:
        self._namespace = namespace

    async def load(self, conversation_id: str) -> Conversation:
        return parsed(await self._namespace.getByName(conversation_id).load())

    async def append(self, conversation_id: str, exchange: Exchange) -> None:
        await self._namespace.getByName(conversation_id).append(json.dumps(exchange))

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        await self._namespace.getByName(conversation_id).fold(summary, dropped)


def _stored(stored: str | None) -> dict:
    """One stored before summaries is a list."""
    value = json.loads(stored or "[]")
    if isinstance(value, list):
        return {"summary": "", "exchanges": value}
    return value


def parsed(stored: str | None) -> Conversation:
    value = _stored(stored)
    return Conversation(value["summary"], tuple(value["exchanges"]))


def appended(stored: str | None, exchange_json: str) -> str:
    value = _stored(stored)
    exchanges = [*value["exchanges"], json.loads(exchange_json)][-MAX_STORED:]
    return json.dumps({"summary": value["summary"], "exchanges": exchanges})


def folded(stored: str | None, summary: str, dropped: int) -> str:
    value = _stored(stored)
    # From a Durable Object call, a whole number can arrive as a float.
    kept = value["exchanges"][int(dropped) :]
    return json.dumps({"summary": summary, "exchanges": kept})
