"""How long a child's recording lives.

Until its turn has ended the audio stays, because a retry marks it again. When the turn has ended,
marked, heard to hold no speech, or failed on the last attempt, the learner's consent decides: with
an active parental consent the recording is kept until `expires_at`, the days the parent chose from
now; without one it is deleted at once. The sweep, run by the Worker's cron trigger, deletes what
has expired and what is a day old without a decision (the phone went away after the upload, a worker
died on its last attempt), so no unconsented recording outlives a day whatever happens. A deleted
recording leaves `audio_deleted_at` on its sample row."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from ..account.consents import DAY_MS, RECORDINGS
from .exercises import MAX_TURN_ATTEMPTS, write_won

logger = logging.getLogger(__name__)

UNDECIDED_KEPT_MS = DAY_MS
PAGE = 100
PAGES = 10

PRESENT = "audio_key IS NOT NULL AND audio_deleted_at IS NULL"

UNDECIDED_SQL = (
    f"SELECT id, audio_key, expires_at FROM samples WHERE id = ?1 AND {PRESENT}"
)
# The consent is read by the write that keeps the recording, so a consent withdrawn at any moment
# before it leaves no recording kept.
KEEP_SQL = (
    "UPDATE samples SET expires_at = ?2 + ?3 * (SELECT retention_days FROM consents "
    f"WHERE learner_key = samples.owner_id AND scope = '{RECORDINGS}' AND revoked_at IS NULL) "
    f"WHERE id = ?1 AND {PRESENT} AND expires_at IS NULL AND EXISTS "
    "(SELECT 1 FROM consents "
    f"WHERE learner_key = samples.owner_id AND scope = '{RECORDINGS}' AND revoked_at IS NULL)"
)
# The sweep names its indexes: with no statistics SQLite reads by state, which is every sample.
ENDED_SQL = (
    "SELECT s.id FROM samples s INDEXED BY samples_audio_undecided WHERE s.state = 'ready' AND s.audio_deleted_at IS NULL "
    "AND s.expires_at IS NULL AND EXISTS (SELECT 1 FROM tutoring_turns t "
    "WHERE t.sample_id = s.id AND (t.state = 'complete' "
    "OR (t.state = 'failed' AND t.attempts >= ?1))) LIMIT ?2"
)
EXPIRED_SQL = (
    "SELECT id, audio_key FROM samples INDEXED BY samples_audio_expiry WHERE audio_key IS NOT NULL "
    "AND audio_deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?1 LIMIT ?2"
)
UNSETTLED_SQL = (
    "SELECT id, audio_key FROM samples INDEXED BY samples_audio_undecided WHERE audio_key IS NOT NULL "
    "AND state = 'ready' AND audio_deleted_at IS NULL AND expires_at IS NULL "
    "AND uploaded_at < ?1 LIMIT ?2"
)
MARK_DELETED_SQL = (
    "UPDATE samples SET audio_deleted_at = ?1 "
    "WHERE id IN (SELECT value FROM json_each(?2))"
)


def _now_ms() -> int:
    return int(time.time() * 1000)


async def rows_of(env: Any, sql: str, *values) -> list[dict]:
    found = await env.DB.prepare(sql).bind(*values).all()
    return [row.to_py() if hasattr(row, "to_py") else row for row in found["results"]]


async def delete_audio(env: Any, rows: list[dict]) -> None:
    """The objects go first: a row marked deleted whose object stayed would hide it from every
    later sweep."""
    await env.AUDIO.delete([row["audio_key"] for row in rows])
    await (
        env.DB.prepare(MARK_DELETED_SQL)
        .bind(_now_ms(), json.dumps([row["id"] for row in rows]))
        .run()
    )


async def settle_audio(env: Any, sample_id: str, now_ms: int | None = None) -> None:
    """Called once a sample's turn has ended: keeps its recording if its learner's parent agreed,
    and deletes it if not. A recording already decided is left as it is. A failure is logged and
    left to the sweep: the marking that ended must still answer the child."""
    try:
        row = await env.DB.prepare(UNDECIDED_SQL).bind(sample_id).first()
        if row is None or row["expires_at"] is not None:
            return
        kept = (
            await env.DB.prepare(KEEP_SQL)
            .bind(sample_id, now_ms if now_ms is not None else _now_ms(), DAY_MS)
            .run()
        )
        if not write_won(kept):
            await delete_audio(env, [row])
    except Exception:
        logger.exception(
            "Recording of %s was not settled; the sweep will try", sample_id
        )


async def sweep_audio(env: Any, now_ms: int | None = None) -> int:
    """Settles the recordings whose turn ended and were not, then deletes every one due for it,
    a page at a time; returns how many were deleted."""
    now = now_ms if now_ms is not None else _now_ms()
    for row in await rows_of(env, ENDED_SQL, MAX_TURN_ATTEMPTS, PAGE):
        await settle_audio(env, row["id"], now)
    deleted = 0
    for sql, limit in ((EXPIRED_SQL, now), (UNSETTLED_SQL, now - UNDECIDED_KEPT_MS)):
        for _ in range(PAGES):
            due = await rows_of(env, sql, limit, PAGE)
            if not due:
                break
            await delete_audio(env, due)
            deleted += len(due)
    return deleted
