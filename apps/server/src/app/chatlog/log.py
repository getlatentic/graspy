"""A chat's events, kept in D1 in the order they happened.

The seq of an event is taken by the statement that inserts it, from the highest seq the chat holds,
and D1 runs one statement at a time, so two writers never take the same one. Events written
together are one batch, which D1 runs as one transaction: a tool's result and the card it made are
both in the log or neither is, and no event of another writer falls between them."""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from .kinds import (
    ASSISTANT,
    COMPACTION,
    IMPORTED,
    KINDS,
    TURN_FINISHED,
    TURN_STARTED,
    USER,
)

# D1 refuses a value over 2 MB; an event is a message, a tool result or a card.
MAX_EVENT_BYTES = 256 * 1024
PAGE = 200

# The highest seq the chat holds is read in a subquery so the insert, not a reader, takes the next.
# The subquery is one row whatever the chat holds, so a false `guard` writes nothing.
_INSERT = (
    "INSERT INTO chat_event (chat, seq, kind, data, at) "
    "SELECT ?1, COALESCE(top, 0) + 1, ?2, ?3, ?4 "
    "FROM (SELECT MAX(seq) AS top FROM chat_event WHERE chat = ?1) WHERE {guard}"
)
# The kinds kept once per turn, each with a unique index (migration 0024). The kind is a literal in the
# guard, from this set, so the guard can use the index.
ONCE_KINDS = frozenset({USER, ASSISTANT, TURN_STARTED, TURN_FINISHED})
_NEW_FOR_TURN = (
    "NOT EXISTS (SELECT 1 FROM chat_event WHERE chat = ?1 AND kind = '{kind}' "
    "AND json_extract(data, '$.turn') = ?5)"
)
_EMPTY = "NOT EXISTS (SELECT 1 FROM chat_event WHERE chat = ?1)"
_MINE = "(SELECT json_extract(data, '$.batch') FROM chat_event WHERE chat = ?1 AND seq = 1) = ?5"
_WON = (
    "SELECT 1 AS won FROM chat_event "
    "WHERE chat = ?1 AND seq = 1 AND json_extract(data, '$.batch') = ?2"
)
_LAST_SEQS = "SELECT seq FROM chat_event WHERE chat = ?1 ORDER BY seq DESC LIMIT ?2"
# The index is named: without statistics SQLite walks the primary key backwards to order by seq, reading
# every event of other kinds between the ones asked for.
_OF_KIND = (
    "SELECT chat, seq, kind, data, at FROM chat_event INDEXED BY chat_event_kind "
    "WHERE chat = ?1 AND kind = ?2 ORDER BY seq DESC LIMIT 1"
)
_LAST = "SELECT MAX(seq) AS seq FROM chat_event WHERE chat = ?1"
_FORGET = "DELETE FROM chat_event WHERE chat = ?1"
# A compaction is kept only if it covers at least as much as the one before it: of two folds that read
# the same state, the one that covers less is not written after the one that covers more.
_NOT_BEHIND = (
    "COALESCE((SELECT MAX(json_extract(data, '$.through')) FROM chat_event "
    "WHERE chat = ?1 AND kind = 'compaction'), 0) <= ?5"
)


def recent_sql(kinds: Sequence[str]) -> str:
    """The latest events of each kind after a seq, one subquery a kind: each is found through the index on
    (chat, kind, seq), without reading the events of other kinds that fall between them. The caller
    merges the kinds. ?1 is the chat, ?2 the seq, ?3 and on the kinds, and the last the limit."""
    limit = f"?{3 + len(kinds)}"
    return " UNION ALL ".join(
        "SELECT chat, seq, kind, data, at FROM (SELECT chat, seq, kind, data, at "
        "FROM chat_event INDEXED BY chat_event_kind "
        f"WHERE chat = ?1 AND kind = ?{3 + n} AND seq > ?2 ORDER BY seq DESC LIMIT {limit})"
        for n in range(len(kinds))
    )


def _select(
    kinds: Sequence[str] | None, order: str, values: tuple, limit: int
) -> tuple[str, tuple]:
    """The events after a seq, of some kinds, in an order, with the placeholders their kinds need."""
    for kind in kinds or ():
        if kind not in KINDS:
            raise ValueError(f"Unknown chat event kind: {kind!r}")
    wanted = ""
    if kinds is not None:
        marks = ", ".join(f"?{at}" for at in range(3, 3 + len(kinds)))
        wanted = f" AND kind IN ({marks})"
    sql = (
        "SELECT chat, seq, kind, data, at FROM chat_event "
        f"WHERE chat = ?1 AND seq > ?2{wanted} {order} LIMIT ?{3 + len(kinds or ())}"
    )
    return sql, (*values, *(kinds or ()), limit)


@dataclass(frozen=True)
class Event:
    chat: str
    seq: int
    kind: str
    data: dict[str, Any]
    at: int


def _row(row: Any) -> dict:
    """D1 rows arrive as dicts, or as JavaScript objects on some runtimes."""
    return row.to_py() if hasattr(row, "to_py") else dict(row)


def _event(row: Any) -> Event:
    kept = _row(row)
    return Event(
        kept["chat"],
        int(kept["seq"]),
        kept["kind"],
        json.loads(kept["data"]),
        int(kept["at"]),
    )


def _encoded(kind: str, data: dict[str, Any]) -> str:
    if kind not in KINDS:
        raise ValueError(f"Unknown chat event kind: {kind!r}")
    # ASCII, so a text D1 would refuse (a lone surrogate) is escaped, and the length is the byte count.
    text = json.dumps(data, separators=(",", ":"))
    if len(text) > MAX_EVENT_BYTES:
        raise ValueError(f"A {kind} event is over {MAX_EVENT_BYTES} bytes")
    return text


class ChatLog:
    def __init__(self, database: Any) -> None:
        self._db = database

    async def append(
        self, chat: str, kind: str, data: dict[str, Any], now_ms: int | None = None
    ) -> int:
        """The seq the event was kept under."""
        return (await self.append_all(chat, [(kind, data)], now_ms))[0]

    async def append_all(
        self,
        chat: str,
        events: Sequence[tuple[str, dict[str, Any]]],
        now_ms: int | None = None,
    ) -> list[int]:
        """The seqs the events were kept under, in order. All of them are kept or none: a kind or a
        size that is refused is refused before anything is written."""
        if not events:
            return []
        at = int(time.time() * 1000) if now_ms is None else now_ms
        encoded = [_encoded(kind, data) for kind, data in events]
        statements = [
            self._db.prepare(_INSERT.format(guard="true")).bind(chat, kind, text, at)
            for (kind, _), text in zip(events, encoded, strict=True)
        ]
        statements.append(self._db.prepare(_LAST_SEQS).bind(chat, len(events)))
        answers = await self._db.batch(statements)
        return sorted(int(_row(row)["seq"]) for row in answers[-1]["results"])

    def _once(self, chat: str, kind: str, data: dict[str, Any], at: int):
        if kind not in ONCE_KINDS:
            raise ValueError(f"A {kind} event is not kept once per turn")
        turn = data.get("turn")
        if not isinstance(turn, str) or not turn:
            raise ValueError(f"A {kind} event kept once per turn names its turn")
        guard = _NEW_FOR_TURN.format(kind=kind)
        return self._db.prepare(_INSERT.format(guard=guard)).bind(
            chat, kind, _encoded(kind, data), at, turn
        )

    async def append_once(
        self, chat: str, kind: str, data: dict[str, Any], now_ms: int | None = None
    ) -> bool:
        """An event kept once per turn: not written again if the chat holds one of this kind for the
        turn named in `data["turn"]`. True if this call kept it."""
        at = int(time.time() * 1000) if now_ms is None else now_ms
        written = await self._once(chat, kind, data, at).run()
        return int(written.meta.changes) > 0

    async def once_seq(self, chat: str, kind: str, turn: str) -> int | None:
        """The seq of the event of `kind` kept for `turn`, if there is one."""
        if kind not in ONCE_KINDS:
            raise ValueError(f"A {kind} event is not kept once per turn")
        found = await (
            self._db.prepare(
                "SELECT seq FROM chat_event WHERE chat = ?1 "
                f"AND kind = '{kind}' AND json_extract(data, '$.turn') = ?2"
            )
            .bind(chat, turn)
            .first()
        )
        return None if found is None else int(_row(found)["seq"])

    async def append_exchange(
        self,
        chat: str,
        turn: str,
        said: dict[str, Any],
        answered: dict[str, Any],
        now_ms: int | None = None,
    ) -> None:
        """A turn's question and answer, together, each kept once: a question written when the turn
        began is not written again, and an answer a turn already kept is not either."""
        at = int(time.time() * 1000) if now_ms is None else now_ms
        await self._db.batch(
            [
                self._once(chat, USER, {**said, "turn": turn}, at),
                self._once(chat, ASSISTANT, {**answered, "turn": turn}, at),
            ]
        )

    async def compact(
        self,
        chat: str,
        summary: str,
        through: int,
        now_ms: int | None = None,
    ) -> None:
        """A summary of the exchanges up to seq `through`, unless a later fold already covers more."""
        at = int(time.time() * 1000) if now_ms is None else now_ms
        text = _encoded(COMPACTION, {"summary": summary, "through": through})
        await (
            self._db.prepare(_INSERT.format(guard=_NOT_BEHIND))
            .bind(chat, COMPACTION, text, at, through)
            .run()
        )

    async def import_once(
        self,
        chat: str,
        marker: dict[str, Any],
        events: Sequence[tuple[str, dict[str, Any]]],
        now_ms: int | None = None,
    ) -> bool:
        """A chat's history from before the log, kept as its first events, once. The first event
        marks the import and is written only if the chat holds nothing; each of the others only if
        that marker is this call's own, so of two imports at once one keeps its events and the other
        none. True if this call's events were kept."""
        at = int(time.time() * 1000) if now_ms is None else now_ms
        token = uuid.uuid4().hex
        first = _encoded(IMPORTED, {**marker, "batch": token})
        statements = [
            self._db.prepare(_INSERT.format(guard=_EMPTY)).bind(
                chat, IMPORTED, first, at
            )
        ]
        statements += [
            self._db.prepare(_INSERT.format(guard=_MINE)).bind(
                chat, kind, _encoded(kind, data), at, token
            )
            for kind, data in events
        ]
        statements.append(self._db.prepare(_WON).bind(chat, token))
        answers = await self._db.batch(statements)
        return bool(answers[-1]["results"])

    async def since(
        self,
        chat: str,
        after: int = 0,
        limit: int = PAGE,
        kinds: Sequence[str] | None = None,
    ) -> list[Event]:
        """The events after `after`, oldest first, at most `limit`; only of `kinds` if given."""
        sql, values = _select(kinds, "ORDER BY seq", (chat, after), limit)
        found = await self._db.prepare(sql).bind(*values).all()
        return [_event(row) for row in found["results"]]

    async def recent(
        self, chat: str, kinds: Sequence[str], after: int, limit: int
    ) -> list[Event]:
        """The last `limit` events of `kinds` after `after`, oldest first."""
        for kind in kinds:
            if kind not in KINDS:
                raise ValueError(f"Unknown chat event kind: {kind!r}")
        found = await (
            self._db.prepare(recent_sql(kinds)).bind(chat, after, *kinds, limit).all()
        )
        events = sorted((_event(row) for row in found["results"]), key=lambda e: e.seq)
        return events[-limit:]

    async def latest_of(self, chat: str, kind: str) -> Event | None:
        found = await self._db.prepare(_OF_KIND).bind(chat, kind).first()
        return None if found is None else _event(found)

    async def last_seq(self, chat: str) -> int:
        found = await self._db.prepare(_LAST).bind(chat).first()
        return 0 if found is None else int(_row(found)["seq"] or 0)

    async def forget(self, chat: str) -> None:
        await self._db.prepare(_FORGET).bind(chat).run()
