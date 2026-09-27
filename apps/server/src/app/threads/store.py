"""Where a learner's tutor conversations are kept for their devices: D1 on a
Worker, SQLite locally (app/local_d1.py). Everything a device sends is kept in
one batch, which D1 runs as one transaction, under the next seq of its owner:
a device reading up to a seq therefore never misses a write below it.

A thread is found by its scope, never by the id a device gave it: two devices
that each started the conversation about a topic hold one thread, the first
the server kept, and each keeps its own id for its copy."""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from .wire import (
    MAX_MESSAGES,
    MAX_THREADS,
    PAGE,
    Changes,
    KeptMessage,
    KeptThread,
    SentThread,
)

_SEQ_NOW = "SELECT seq FROM tutor_sync WHERE owner_id = ?1"
_SEQ = f"({_SEQ_NOW})"

_NEXT_SEQ = (
    "INSERT INTO tutor_sync (owner_id, seq) VALUES (?1, 1) "
    "ON CONFLICT (owner_id) DO UPDATE SET seq = seq + 1"
)

_SENT_THREADS = (
    "SELECT json_extract(value, '$.id') AS id, "
    "json_extract(value, '$.scopeKey') AS scope_key, "
    "json_extract(value, '$.scope') AS scope_json, "
    "json_extract(value, '$.agentContextId') AS agent_context_id, "
    "json_extract(value, '$.preview') AS preview, "
    "json_extract(value, '$.createdAt') AS created_at, "
    "json_extract(value, '$.updatedAt') AS updated_at "
    "FROM json_each(?2)"
)

# A thread new to its scope is kept; one whose scope is kept already, or
# whose id names another scope's, is not.
_NEW_THREADS = (
    "INSERT INTO tutor_threads (owner_id, id, scope_key, scope_json, "
    "agent_context_id, preview, created_at, updated_at, seq) "
    "SELECT ?1, id, scope_key, scope_json, agent_context_id, preview, "
    f"created_at, updated_at, {_SEQ} FROM ({_SENT_THREADS}) WHERE true "
    "ON CONFLICT DO NOTHING"
)

# The later question is the preview, and the first reply's context holds the
# tutor's memory of the conversation for every device.
_KNOWN_THREADS = (
    "UPDATE tutor_threads SET "
    "preview = CASE WHEN sent.updated_at > tutor_threads.updated_at "
    "THEN COALESCE(sent.preview, tutor_threads.preview) "
    "ELSE tutor_threads.preview END, "
    "updated_at = MAX(tutor_threads.updated_at, sent.updated_at), "
    "created_at = MIN(tutor_threads.created_at, sent.created_at), "
    "agent_context_id = COALESCE(tutor_threads.agent_context_id, sent.agent_context_id), "
    f"seq = {_SEQ} "
    f"FROM ({_SENT_THREADS}) AS sent "
    "WHERE tutor_threads.owner_id = ?1 AND tutor_threads.scope_key = sent.scope_key "
    "AND (sent.updated_at > tutor_threads.updated_at "
    "OR sent.created_at < tutor_threads.created_at "
    "OR (tutor_threads.agent_context_id IS NULL AND sent.agent_context_id IS NOT NULL))"
)

# Appended by id into the thread kept for the message's scope; a message kept
# already changes only for a later edit.
_MESSAGES = (
    "INSERT INTO tutor_messages (owner_id, id, thread_id, type, content, "
    "timestamp, edited_at, metadata_json, seq) "
    "SELECT ?1, json_extract(sent.value, '$.id'), thread.id, "
    "json_extract(sent.value, '$.type'), json_extract(sent.value, '$.content'), "
    "json_extract(sent.value, '$.timestamp'), json_extract(sent.value, '$.editedAt'), "
    f"json_extract(sent.value, '$.metadata'), {_SEQ} "
    "FROM json_each(?2) AS sent JOIN tutor_threads AS thread "
    "ON thread.owner_id = ?1 AND thread.scope_key = json_extract(sent.value, '$.scopeKey') "
    "WHERE true "
    "ON CONFLICT (owner_id, id) DO UPDATE SET content = excluded.content, "
    "edited_at = excluded.edited_at, metadata_json = excluded.metadata_json, "
    "seq = excluded.seq WHERE excluded.edited_at > tutor_messages.edited_at"
)

_OLDEST_THREADS = (
    "SELECT id FROM tutor_threads WHERE owner_id = ?1 "
    "ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?2"
)
_DROP_OLDEST_THREADS_MESSAGES = f"DELETE FROM tutor_messages WHERE owner_id = ?1 AND thread_id IN ({_OLDEST_THREADS})"
_DROP_OLDEST_THREADS = (
    f"DELETE FROM tutor_threads WHERE owner_id = ?1 AND id IN ({_OLDEST_THREADS})"
)

_DROP_OLDEST_MESSAGES = (
    "DELETE FROM tutor_messages WHERE rowid IN (SELECT rowid FROM ("
    "SELECT message.rowid AS rowid, ROW_NUMBER() OVER ("
    "PARTITION BY message.thread_id ORDER BY message.timestamp DESC, message.id DESC"
    ") AS place FROM tutor_messages AS message JOIN tutor_threads AS thread "
    "ON thread.owner_id = message.owner_id AND thread.id = message.thread_id "
    "WHERE message.owner_id = ?1 AND thread.scope_key IN "
    "(SELECT value FROM json_each(?2))) WHERE place > ?3)"
)

_THREAD_COLUMNS = "id, scope_json, agent_context_id, preview, created_at, updated_at"

_CHANGED_THREADS = (
    f"SELECT {_THREAD_COLUMNS} FROM tutor_threads "
    "WHERE owner_id = ?1 AND seq > ?2 AND seq <= ?3 ORDER BY id"
)

_THREADS_BY_ID = (
    f"SELECT {_THREAD_COLUMNS} FROM tutor_threads "
    "WHERE owner_id = ?1 AND id IN (SELECT value FROM json_each(?2)) ORDER BY id"
)

_CHANGED_MESSAGES = (
    "SELECT id, thread_id, type, content, timestamp, edited_at, metadata_json, seq "
    "FROM tutor_messages WHERE owner_id = ?1 AND seq > ?2 AND seq <= ?3 "
    "AND (seq, id) > (?4, ?5) ORDER BY seq, id LIMIT ?6"
)

_FORGET = (
    "DELETE FROM tutor_messages WHERE owner_id = ?1",
    "DELETE FROM tutor_threads WHERE owner_id = ?1",
    "DELETE FROM tutor_sync WHERE owner_id = ?1",
)


class BadCursor(ValueError):
    pass


def _cursor(seq: int, message_id: str) -> str:
    return f"{seq}.{message_id}"


def _after(cursor: str | None) -> tuple[int, str]:
    if cursor is None:
        return (0, "")
    seq, _, message_id = cursor.partition(".")
    if not seq.isdigit() or not message_id:
        raise BadCursor(cursor)
    return (int(seq), message_id)


def _one_per_scope(threads: Iterable[SentThread]) -> list[SentThread]:
    """A device holding two copies of one conversation sends them as one."""
    by_scope: dict[str, SentThread] = {}
    for thread in threads:
        kept = by_scope.get(thread.key)
        by_scope[thread.key] = thread if kept is None else _joined(kept, thread)
    return list(by_scope.values())


def _joined(first: SentThread, second: SentThread) -> SentThread:
    later, earlier = sorted((first, second), key=lambda t: t.updated_at, reverse=True)
    return later.model_copy(
        update={
            "created_at": min(first.created_at, second.created_at),
            "preview": later.preview or earlier.preview,
            "agent_context_id": first.agent_context_id or second.agent_context_id,
            "messages": [*first.messages, *second.messages],
        }
    )


def _sent_threads(threads: list[SentThread]) -> str:
    return json.dumps(
        [
            {
                "id": thread.id,
                "scopeKey": thread.key,
                "scope": json.dumps(thread.scope.model_dump(by_alias=True)),
                "agentContextId": thread.agent_context_id,
                "preview": thread.preview,
                "createdAt": thread.created_at,
                "updatedAt": thread.updated_at,
            }
            for thread in threads
        ]
    )


def _sent_messages(threads: list[SentThread]) -> str:
    return json.dumps(
        [
            {
                "scopeKey": thread.key,
                "id": message.id,
                "type": message.type,
                "content": message.content,
                "timestamp": message.timestamp,
                "editedAt": message.edited_at,
                "metadata": None
                if message.metadata is None
                else json.dumps(message.metadata),
            }
            for thread in threads
            for message in thread.messages
        ]
    )


def _row(row: Any) -> dict:
    """D1 rows arrive as dicts, or as JavaScript objects on some runtimes."""
    return row.to_py() if hasattr(row, "to_py") else dict(row)


def _results(answer: Any) -> list[dict]:
    return [_row(row) for row in answer["results"]]


def _thread(row: dict, messages: list[KeptMessage]) -> KeptThread:
    return KeptThread(
        id=row["id"],
        scope=json.loads(row["scope_json"]),
        agent_context_id=row["agent_context_id"],
        preview=row["preview"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        messages=messages,
    )


def _message(row: dict) -> KeptMessage:
    metadata = row["metadata_json"]
    return KeptMessage(
        id=row["id"],
        type=row["type"],
        content=row["content"],
        timestamp=row["timestamp"],
        edited_at=row["edited_at"],
        metadata=None if metadata is None else json.loads(metadata),
    )


class ThreadStore:
    """Every statement names its owner, so no learner's threads are read or
    written under another's."""

    def __init__(self, database: Any) -> None:
        self._db = database

    async def keep(self, owner: str, sent: list[SentThread]) -> int:
        """The seq the threads were kept under."""
        threads = _one_per_scope(sent)
        scope_keys = json.dumps([thread.key for thread in threads])
        sent_threads = _sent_threads(threads)
        statements = [
            self._db.prepare(_NEXT_SEQ).bind(owner),
            self._db.prepare(_NEW_THREADS).bind(owner, sent_threads),
            self._db.prepare(_KNOWN_THREADS).bind(owner, sent_threads),
            self._db.prepare(_MESSAGES).bind(owner, _sent_messages(threads)),
            self._db.prepare(_DROP_OLDEST_MESSAGES).bind(
                owner, scope_keys, MAX_MESSAGES
            ),
            self._db.prepare(_DROP_OLDEST_THREADS_MESSAGES).bind(owner, MAX_THREADS),
            self._db.prepare(_DROP_OLDEST_THREADS).bind(owner, MAX_THREADS),
            self._db.prepare(_SEQ_NOW).bind(owner),
        ]
        answers = await self._db.batch(statements)
        return int(_results(answers[-1])[0]["seq"])

    async def changes(
        self, owner: str, since: int, up_to: int | None, after: str | None
    ) -> Changes:
        """Raises BadCursor for an ``after`` this store never gave."""
        after_seq, after_id = _after(after)
        if up_to is None:
            found = await self._db.prepare(_SEQ_NOW).bind(owner).first()
            up_to = int(_row(found)["seq"]) if found else 0
        messages = _results(
            await self._db.prepare(_CHANGED_MESSAGES)
            .bind(owner, since, up_to, after_seq, after_id, PAGE)
            .all()
        )
        threads = await self._threads_of(owner, since, up_to, after, messages)
        last = messages[-1] if len(messages) == PAGE else None
        return Changes(
            up_to=up_to,
            threads=threads,
            next=_cursor(int(last["seq"]), last["id"]) if last else None,
        )

    async def _threads_of(
        self,
        owner: str,
        since: int,
        up_to: int,
        after: str | None,
        messages: list[dict],
    ) -> list[KeptThread]:
        """Each message under its thread, so a device finds its scope; the
        first page also brings every thread that changed without a message."""
        ids = json.dumps(sorted({message["thread_id"] for message in messages}))
        rows = _results(await self._db.prepare(_THREADS_BY_ID).bind(owner, ids).all())
        if after is None:
            rows += _results(
                await self._db.prepare(_CHANGED_THREADS).bind(owner, since, up_to).all()
            )
        by_id = {row["id"]: row for row in rows}
        grouped: dict[str, list[KeptMessage]] = {thread_id: [] for thread_id in by_id}
        for message in messages:
            grouped.setdefault(message["thread_id"], []).append(_message(message))
        return [
            _thread(by_id[thread_id], found)
            for thread_id, found in grouped.items()
            if thread_id in by_id
        ]

    async def forget(self, owner: str) -> None:
        await self._db.batch([self._db.prepare(sql).bind(owner) for sql in _FORGET])
