"""The tutor's conversation memory, read from a chat's log: the exchanges the prompt carries and the
summary of the ones folded away are a fold of the events, so history has one source.

An exchange is a `user` event and the `assistant` event after it, kept together. A fold is a
`compaction` event: it names the last seq it covers, so an exchange kept after the fold was read is
never dropped by it. A conversation that began before the log is imported from the store that held it,
once, when it is first read."""

from __future__ import annotations

import uuid
from typing import Any

from ..agent.memory import MAX_STORED, Conversation, ConversationStore, Exchange
from .kinds import ASSISTANT, COMPACTION, USER
from .log import ChatLog, Event

# Each text of an exchange is cut to this many bytes: the Durable Object kept any length, an event
# is at most MAX_EVENT_BYTES, and an exchange too long for the log must not make a chat unreadable.
MAX_TEXT_BYTES = 60 * 1024
# How many chats this store has found to hold events: asked of the database once each.
MAX_KNOWN = 1000


def _fit(text: str) -> str:
    kept = text.encode("utf-8", "replace")
    return (
        text
        if len(kept) <= MAX_TEXT_BYTES
        else kept[:MAX_TEXT_BYTES].decode("utf-8", "ignore")
    )


def _texts(exchange: Exchange) -> tuple[dict[str, Any], dict[str, Any]]:
    """What the two events of an exchange hold."""
    said: dict[str, Any] = {"text": _fit(exchange["message"])}
    if "app" in exchange:
        said["app"] = _fit(exchange["app"])
    answered: dict[str, Any] = {"text": _fit(exchange["answer"])}
    if "card" in exchange:
        answered["card"] = _fit(exchange["card"])
    return said, answered


def _events(exchange: Exchange, turn: str) -> list[tuple[str, dict[str, Any]]]:
    """The two events of an exchange, paired by `turn`, so they stay a pair when other events fall
    between them."""
    said, answered = _texts(exchange)
    return [(USER, {"turn": turn, **said}), (ASSISTANT, {"turn": turn, **answered})]


def _exchange(asked: Event, answered: Event) -> Exchange:
    exchange = Exchange(message=asked.data["text"], answer=answered.data["text"])
    if "app" in asked.data:
        exchange["app"] = asked.data["app"]
    if "card" in answered.data:
        exchange["card"] = answered.data["card"]
    return exchange


def _pairs(events: list[Event]) -> list[tuple[Event, Event]]:
    """Each `user` event with the `assistant` event of its turn, in the order the answers were
    kept. A `user` event whose answer has not been kept, and an answer whose question is not
    among the events, are not an exchange."""
    asked: dict[str, Event] = {}
    pairs: list[tuple[Event, Event]] = []
    for event in events:
        turn = event.data.get("turn")
        if event.kind == USER and turn is not None:
            asked[turn] = event
        elif event.kind == ASSISTANT and turn in asked:
            pairs.append((asked.pop(turn), event))
    return pairs


class LogConversationStore:
    """`legacy` is the store conversations were kept in before the log, if any."""

    def __init__(self, database: Any, legacy: ConversationStore | None = None) -> None:
        self._log = ChatLog(database)
        self._legacy = legacy
        self._known: set[str] = set()

    async def _held(self, chat: str) -> tuple[str, int, list[tuple[Event, Event]]]:
        """The summary the latest compaction wrote, the seq it covers through, and the exchanges
        after that: the last MAX_STORED, as the stores before the log kept."""
        await self._imported(chat)
        compaction = await self._log.latest_of(chat, COMPACTION)
        covered = compaction.data["through"] if compaction else 0
        events = await self._log.recent(
            chat, (USER, ASSISTANT), covered, 2 * MAX_STORED + 1
        )
        summary = compaction.data["summary"] if compaction else ""
        return summary, covered, _pairs(events)[-MAX_STORED:]

    async def load(self, conversation_id: str) -> Conversation:
        summary, _, pairs = await self._held(conversation_id)
        return Conversation(summary, tuple(_exchange(*pair) for pair in pairs))

    async def append(
        self, conversation_id: str, exchange: Exchange, turn: str | None = None
    ) -> None:
        """Kept once for a `turn` named: a turn run again does not keep its exchange twice."""
        await self._imported(conversation_id)
        said, answered = _texts(exchange)
        await self._log.append_exchange(
            conversation_id, turn or uuid.uuid4().hex, said, answered
        )
        self._remember(conversation_id)

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        """Covers the oldest `dropped` exchanges held now; those kept since stay."""
        _, covered, pairs = await self._held(conversation_id)
        # From a Durable Object call a whole number can arrive as a float; this store is called the same way.
        count = min(int(dropped), len(pairs))
        through = pairs[count - 1][1].seq if count > 0 else covered
        await self._log.compact(conversation_id, summary, through)

    async def forget(self, conversation_id: str) -> None:
        self._known.discard(conversation_id)
        await self._log.forget(conversation_id)
        if self._legacy is not None:
            await self._legacy.forget(conversation_id)

    async def _imported(self, chat: str) -> None:
        if self._legacy is None or chat in self._known:
            return
        if await self._log.last_seq(chat) > 0:
            return self._remember(chat)
        before = await self._legacy.load(chat)
        if not before.exchanges and not before.summary:
            return
        events: list[tuple[str, dict[str, Any]]] = [
            (COMPACTION, {"summary": before.summary, "through": 1})
        ]
        for exchange in before.exchanges:
            events += _events(exchange, uuid.uuid4().hex)
        await self._log.import_once(chat, {"exchanges": len(before.exchanges)}, events)
        self._remember(chat)

    def _remember(self, chat: str) -> None:
        if len(self._known) >= MAX_KNOWN:
            self._known.clear()
        self._known.add(chat)
