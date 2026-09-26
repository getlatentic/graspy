"""A learner's recording: first what it answers, then the audio itself.

The metadata is kept before the audio so a retried upload lands on the same sample, and the
Idempotency-Key makes a retried create return that sample rather than make another. A recording
may name the plan event it answers only with a prompt that event can ask, so progress on an event
can only be made by doing what it asks."""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.responses import JSONResponse

from .curriculum import SCHOOL_CLASSES, load_plans
from .exercises import write_won
from .keeping import recordings_prefix
from .teacher import answerable_prompts

SAMPLE_ID = r"gvm_[a-z0-9_-]+"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
AUDIO_TYPES = frozenset({"audio/wav", "audio/x-wav", "audio/ogg"})

SAMPLE_BY_KEY_SQL = (
    "SELECT id, state, metadata_fingerprint FROM samples "
    "WHERE owner_id = ?1 AND idempotency_key = ?2"
)
CREATE_SQL = (
    "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, state, "
    "metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, 'awaiting_audio', ?5, ?6) "
    "ON CONFLICT (owner_id, idempotency_key) DO NOTHING"
)
SAMPLE_SQL = "SELECT id, state FROM samples WHERE id = ?1 AND owner_id = ?2"
UPLOADED_SQL = (
    "UPDATE samples SET state = 'ready', audio_key = ?3, audio_content_type = ?4, "
    "audio_bytes = ?5, uploaded_at = ?6 WHERE id = ?1 AND owner_id = ?2"
)


def _problem(status: int, detail: str, code: str | None = None) -> JSONResponse:
    body = {"detail": detail} if code is None else {"detail": detail, "code": code}
    return JSONResponse(body, status_code=status)


def _require_owning_event(payload) -> None:
    """The named event must be the one this recording answers, so progress cannot be falsified."""
    plan = load_plans().get(str(payload["plan_id"]))
    event = (
        next((e for e in plan.events if e.id == payload["event_id"]), None)
        if plan
        else None
    )
    if event is None:
        raise ValueError("plan_id and event_id must name a lesson plan event")
    if payload.get("prompt_id") not in answerable_prompts(plan, event):
        raise ValueError(
            "prompt_id must be an activity the named lesson event can ask for"
        )


def _validated_metadata(payload):
    if not isinstance(payload, dict):
        raise TypeError("JSON body must be an object")
    required = ("speaker_id", "language_pair", "task", "topic", "consent")
    missing = [field for field in required if field not in payload]
    if missing:
        raise ValueError(f"missing required fields: {', '.join(missing)}")
    if payload["language_pair"] not in {"yo-en", "pcm-en"}:
        raise ValueError("language_pair must be yo-en or pcm-en")
    if payload.get("spoken_language") not in {None, "en", "yo", "pcm"}:
        raise ValueError("spoken_language must be en, yo, or pcm")
    if payload.get("learner_class") not in {None, *SCHOOL_CLASSES}:
        raise ValueError(f"learner_class must be one of: {', '.join(SCHOOL_CLASSES)}")
    if (payload.get("plan_id") is None) != (payload.get("event_id") is None):
        raise ValueError("plan_id and event_id come together")
    if payload.get("plan_id") is not None:
        _require_owning_event(payload)
    consent = payload["consent"]
    if not isinstance(consent, dict) or consent.get("granted") is not True:
        raise ValueError("recording consent is required")
    return payload


def _created(sample_id: str, state: str) -> dict:
    upload = None if state == "ready" else f"/api/voice/samples/{sample_id}/audio"
    return {"sample_id": sample_id, "state": state, "upload_path": upload}


def _again(existing: dict, fingerprint: str) -> JSONResponse:
    if existing["metadata_fingerprint"] != fingerprint:
        return _problem(
            409,
            "idempotency key was already used with different metadata",
            "idempotency_conflict",
        )
    return JSONResponse(_created(existing["id"], existing["state"]), status_code=200)


async def _by_key(database, learner: str, key: str) -> dict | None:
    return await database.prepare(SAMPLE_BY_KEY_SQL).bind(learner, key).first()


async def create_sample(
    env, learner: str, idempotency_key: str | None, body: bytes
) -> JSONResponse:
    key = (idempotency_key or "").strip()
    if not key:
        return _problem(400, "Idempotency-Key is required")
    try:
        metadata = _validated_metadata(json.loads(body.decode("utf-8")))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as error:
        return _problem(400, str(error))
    canonical = json.dumps(metadata, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(canonical.encode()).hexdigest()
    existing = await _by_key(env.DB, learner, key)
    if existing is not None:
        return _again(existing, fingerprint)
    sample_id = f"gvm_{uuid.uuid4().hex}"
    written = await (
        env.DB.prepare(CREATE_SQL)
        .bind(sample_id, learner, key, fingerprint, canonical, _now_ms())
        .run()
    )
    if not write_won(written):
        # Another request with the same key made the sample first.
        return _again(await _by_key(env.DB, learner, key), fingerprint)
    return JSONResponse(_created(sample_id, "awaiting_audio"), status_code=201)


def _upload_problem(
    content_type: str, content_length: str | None
) -> JSONResponse | None:
    if content_type not in AUDIO_TYPES:
        return _problem(415, "audio must be WAV or Ogg")
    length = int(content_length) if (content_length or "").isdigit() else 0
    if length <= 0:
        return _problem(411, "a positive Content-Length is required")
    if length > MAX_AUDIO_BYTES:
        return _problem(413, "audio exceeds the 10 MiB limit")
    return None


def media_type(header: str | None) -> str:
    """The type without its parameters: "audio/wav; codecs=1" is WAV."""
    return (header or "").split(";", 1)[0].strip().lower()


async def upload_audio(
    env,
    learner: str,
    sample_id: str,
    content_type: str,
    content_length: str | None,
    read: Callable[[], Awaitable[bytes]],
) -> JSONResponse:
    """The body is read only once the declared size and the sample have been checked."""
    refused = _upload_problem(content_type, content_length)
    if refused is not None:
        return refused
    sample = await env.DB.prepare(SAMPLE_SQL).bind(sample_id, learner).first()
    if sample is None:
        return _problem(404, "sample was not found")
    if sample["state"] == "ready":
        return JSONResponse({"sample_id": sample_id, "state": "ready"})
    body = await read()
    if not body:
        return _problem(411, "a positive Content-Length is required")
    if len(body) > MAX_AUDIO_BYTES:
        return _problem(413, "audio exceeds the 10 MiB limit")
    extension = "ogg" if content_type == "audio/ogg" else "wav"
    audio_key = f"{recordings_prefix(learner)}samples/{sample_id}.{extension}"
    await env.AUDIO.put(audio_key, body, httpMetadata={"contentType": content_type})
    await (
        env.DB.prepare(UPLOADED_SQL)
        .bind(sample_id, learner, audio_key, content_type, len(body), _now_ms())
        .run()
    )
    return JSONResponse({"sample_id": sample_id, "state": "ready"})


def _now_ms() -> int:
    return int(time.time() * 1000)
