"""What a learner's voice lessons keep, forgotten when the learner is removed: their recordings
and marked turns, the steps they were offered and heard, a parent's consents, and the tutor's memory
of them.

Recordings are the only thing kept per learner in the bucket. The teacher's lines and replies are
kept by their words and shared by every learner, so they stay."""

from __future__ import annotations

from typing import Any, Protocol
from urllib.parse import quote

from .learner_memory import forget_memory

# Turns first: they are found through the learner's samples.
FORGET_SQL = (
    (
        "DELETE FROM tutoring_turns WHERE sample_id IN "
        "(SELECT id FROM samples WHERE owner_id = ?1)"
    ),
    "DELETE FROM samples WHERE owner_id = ?1",
    "DELETE FROM lesson_events WHERE owner_id = ?1",
    "DELETE FROM lesson_offers WHERE owner_id = ?1",
    "DELETE FROM consents WHERE learner_key = ?1",
)


def recordings_prefix(learner: str) -> str:
    """Where a learner's recordings are kept. Quoted, so one learner's prefix never holds
    another's: a key may contain the slash that separates them."""
    return f"learners/{quote(learner, safe='')}/"


class VoiceKeeping(Protocol):
    async def forget(self, learner: str) -> None: ...


class NoVoice:
    """Without the Worker's bindings no voice lesson was ever kept."""

    async def forget(self, learner: str) -> None:
        return None


NO_VOICE = NoVoice()


class BoundVoice:
    """Over the Worker's bindings: D1, the audio bucket and the tutor Worker."""

    def __init__(self, env: Any) -> None:
        self._env = env

    async def forget(self, learner: str) -> None:
        for sql in FORGET_SQL:
            await self._env.DB.prepare(sql).bind(learner).run()
        await _forget_recordings(self._env.AUDIO, recordings_prefix(learner))
        await forget_memory(self._env, learner)


async def _forget_recordings(bucket: Any, prefix: str) -> None:
    """A listing arrives as a dict whose objects are R2 objects, as the
    Workers runtime converts it."""
    cursor = None
    while True:
        options = (
            {"prefix": prefix}
            if cursor is None
            else {"prefix": prefix, "cursor": cursor}
        )
        listing = await bucket.list(**options)
        keys = [found.key for found in listing["objects"]]
        if keys:
            await bucket.delete(keys)
        if not listing["truncated"]:
            return
        cursor = listing["cursor"]
