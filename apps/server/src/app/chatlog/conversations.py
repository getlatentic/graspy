"""The tutor's conversation memory, read from a chat's log: the exchanges the prompt carries and the
summary of the ones folded away are a fold of the events, so history has one source.

An exchange is a `user` event and the `assistant` event after it, kept together. A fold is a
`compaction` event: it names the last seq it covers, so an exchange kept after the fold was read is
never dropped by it. A conversation that began before the log is imported from the store that held it,
once, when it is first read."""

from __future__ import annotations

from typing import Any

from ..agent.memory import MAX_STORED, Conversation, ConversationStore, Exchange
from .kinds import ASSISTANT, COMPACTION, USER
from .log import ChatLog, Event


def _events(exchange: Exchange) -> list[tuple[str, dict[str, Any]]]:
    said: dict[str, Any] = {"text": exchange["message"]}
    if "app" in exchange:
        said["app"] = exchange["app"]
    answered: dict[str, Any] = {"text": exchange["answer"]}
    if "card" in exchange:
        answered["card"] = exchange["card"]
    return [(USER, said), (ASSISTANT, answered)]


def _exchange(asked: Event, answered: Event) -> Exchange:
    exchange = Exchange(message=asked.data["text"], answer=answered.data["text"])
    if "app" in asked.data:
        exchange["app"] = asked.data["app"]
    if "card" in answered.data:
        exchange["card"] = answered.data["card"]
    return exchange


def _pairs(events: list[Event]) -> list[tuple[Event, Event]]:
    """Each `user` event with the `assistant` event that follows it: they are written in one batch,
    so nothing falls between them."""
    pairs: list[tuple[Event, Event]] = []
    pending: Event | None = None
    for event in events:
        if event.kind == USER:
            pending = event
        elif event.kind == ASSISTANT and pending is not None:
            pairs.append((pending, event))
            pending = None
    return pairs


class LogConversationStore:
    """`legacy` is the store conversations were kept in before the log, if any."""

    def __init__(self, database: Any, legacy: ConversationStore | None = None) -> None:
        self._log = ChatLog(database)
        self._legacy = legacy

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

    async def append(self, conversation_id: str, exchange: Exchange) -> None:
        await self._imported(conversation_id)
        await self._log.append_all(conversation_id, _events(exchange))

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None:
        """Covers the oldest `dropped` exchanges held now; those kept since stay."""
        _, covered, pairs = await self._held(conversation_id)
        # From a Durable Object call a whole number can arrive as a float; this store is called the same way.
        count = min(int(dropped), len(pairs))
        through = pairs[count - 1][1].seq if count > 0 else covered
        await self._log.append(
            conversation_id, COMPACTION, {"summary": summary, "through": through}
        )

    async def forget(self, conversation_id: str) -> None:
        await self._log.forget(conversation_id)
        if self._legacy is not None:
            await self._legacy.forget(conversation_id)

    async def _imported(self, chat: str) -> None:
        if self._legacy is None or await self._log.last_seq(chat) > 0:
            return
        before = await self._legacy.load(chat)
        if not before.exchanges and not before.summary:
            return
        events: list[tuple[str, dict[str, Any]]] = [
            (COMPACTION, {"summary": before.summary, "through": 1})
        ]
        for exchange in before.exchanges:
            events += _events(exchange)
        await self._log.import_once(chat, {"exchanges": len(before.exchanges)}, events)
