"""What a parent sees and does with the recordings kept for one of their learners.

Only a recording that was kept, with a parent's consent, and has not expired is ever shown, heard or
deleted here; the caller has already checked that the learner belongs to the parent's account, and
every query is under that learner's key. Deleting a recording removes its object from the bucket."""

from __future__ import annotations

import json
import time
from typing import Any

from .curriculum import load_plans
from .recording_retention import PAGE, PAGES, delete_audio, rows_of

PCM16_BYTES_PER_SECOND = 16_000 * 2
WAV_HEADER_BYTES = 44
MAX_LISTED = 200

KEPT = (
    "s.owner_id = ?1 AND s.audio_key IS NOT NULL AND s.audio_deleted_at IS NULL "
    "AND s.expires_at IS NOT NULL"
)
LIST_SQL = (
    "SELECT s.id, s.uploaded_at, s.expires_at, s.audio_bytes, s.audio_content_type, "
    "s.metadata_json, t.transcript FROM samples s "
    "LEFT JOIN tutoring_turns t ON t.sample_id = s.id "
    f"WHERE {KEPT} AND s.expires_at > ?2 AND (?3 IS NULL OR s.uploaded_at < ?3 "
    "OR (s.uploaded_at = ?3 AND s.id < ?4)) "
    "ORDER BY s.uploaded_at DESC, s.id DESC LIMIT ?5"
)
HEARD_SQL = (
    "SELECT s.audio_key, s.audio_content_type FROM samples s "
    f"WHERE {KEPT} AND s.expires_at > ?2 AND s.id = ?3"
)
DELETABLE_SQL = f"SELECT s.id, s.audio_key FROM samples s WHERE {KEPT} LIMIT ?2"
ONE_DELETABLE_SQL = (
    f"SELECT s.id, s.audio_key FROM samples s WHERE {KEPT} AND s.id = ?2"
)


def _lesson(metadata_json: str) -> str | None:
    metadata = json.loads(metadata_json)
    plan = load_plans().get(str(metadata.get("plan_id")))
    if plan is None:
        return None
    return plan.title.get(metadata.get("lesson_language", "en")) or next(
        iter(plan.title.values()), None
    )


def _seconds(row: dict) -> int | None:
    """Known for the 16 kHz mono WAV the apps record; other audio has no length here."""
    if row["audio_content_type"] not in ("audio/wav", "audio/x-wav"):
        return None
    return max(
        0, round((row["audio_bytes"] - WAV_HEADER_BYTES) / PCM16_BYTES_PER_SECOND)
    )


def _listed(row: dict) -> dict:
    return {
        "id": row["id"],
        "recorded_at": row["uploaded_at"],
        "expires_at": row["expires_at"],
        "lesson": _lesson(row["metadata_json"]),
        "transcript": row["transcript"],
        "duration_seconds": _seconds(row),
        "bytes": row["audio_bytes"],
    }


def _now_ms() -> int:
    return int(time.time() * 1000)


async def kept_recordings(
    env: Any, learner_key: str, limit: int, before: int | None, before_id: str | None
) -> tuple[list[dict], tuple[int, str] | None]:
    """The newest `limit` recordings before the cursor (recorded time and id; none for the newest),
    and the cursor of the next page."""
    size = min(limit, MAX_LISTED)
    rows = await rows_of(
        env, LIST_SQL, learner_key, _now_ms(), before, before_id, size + 1
    )
    page = rows[:size]
    last = page[-1] if len(rows) > size else None
    return [_listed(row) for row in page], (
        None if last is None else (last["uploaded_at"], last["id"])
    )


async def heard_recording(env: Any, learner_key: str, sample_id: str):
    """The recording's bytes and type, or None when it is not kept for this learner."""
    row = (
        await env.DB.prepare(HEARD_SQL).bind(learner_key, _now_ms(), sample_id).first()
    )
    if row is None:
        return None
    stored = await env.AUDIO.get(row["audio_key"])
    if stored is None:
        return None
    return bytes(await stored.bytes()), row["audio_content_type"]


async def delete_kept(env: Any, learner_key: str, sample_id: str | None = None) -> int:
    """Deletes one kept recording, or as many of the learner's as fit in one call; returns how
    many went. Asked again it deletes the rest, and a recording already gone is not an error."""
    deleted = 0
    for _ in range(1 if sample_id else PAGES):
        rows = (
            await rows_of(env, ONE_DELETABLE_SQL, learner_key, sample_id)
            if sample_id
            else await rows_of(env, DELETABLE_SQL, learner_key, PAGE)
        )
        if not rows:
            break
        await delete_audio(env, rows)
        deleted += len(rows)
    return deleted


async def more_kept(env: Any, learner_key: str) -> bool:
    return bool(await rows_of(env, DELETABLE_SQL, learner_key, 1))
