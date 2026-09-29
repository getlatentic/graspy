"""A parent's say over a learner's voice recordings: agree to keep them, or stop, and listen to and
delete what was kept. Only a signed-in account session reaches these, for a learner the account
holds; a device's own session never does. What the routes promise is in docs/API.md."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import Field
from starlette.responses import Response

from ..account.consents import (
    NOTICE_VERSIONS,
    RECORDINGS,
    active_consent,
    grant_consent,
    revoke_consent,
)
from ..account.directory import LearnerId, learner_key
from ..account.learners import NoSuchLearner, learner_of
from ..learner.time import now_ms
from ..local_d1 import MAX_BOUND_INTEGER
from ..voice.parent_recordings import (
    delete_kept,
    heard_recording,
    kept_recordings,
    more_kept,
)
from ..voice.samples import SAMPLE_ID
from ..wire import Wire
from .account_routes import KeepingDep, Uid, no_such_learner
from .consent_proof import refusal, require_fresh_sign_in, require_known_notice
from .listed_learners import VoiceConsent
from .voice_routes import EnvDep

account_voice_router = APIRouter(
    prefix="/account/learners/{learner_id}/voice", tags=["voice recordings"]
)


async def _own_learner(uid: Uid, keeping: KeepingDep, learner_id: LearnerId) -> str:
    try:
        await learner_of(keeping, uid, learner_id)
    except NoSuchLearner:
        raise no_such_learner(learner_id) from None
    return learner_key(uid, learner_id)


LearnerKey = Annotated[str, Depends(_own_learner)]
SampleId = Annotated[str, Path(pattern=f"^{SAMPLE_ID}$", max_length=80)]


class ConsentState(VoiceConsent):
    granted_at: int


class Recording(Wire):
    id: str
    recorded_at: int
    expires_at: int
    lesson: str | None
    transcript: str | None
    duration_seconds: int | None
    bytes: int


class VoiceOverview(Wire):
    consent: ConsentState | None
    recordings: list[Recording]
    next_before: int | None
    next_before_id: str | None


class ConsentGrant(Wire):
    notice_version: int
    retention_days: Literal[30, 90, 365]
    firebase_id_token: str = Field(max_length=4096)


class Deleted(Wire):
    deleted: int
    more: bool


def _consent(row: dict | None) -> ConsentState | None:
    return None if row is None else ConsentState(**row)


@account_voice_router.get("", response_model=VoiceOverview)
async def voice_overview(
    env: EnvDep,
    learner: LearnerKey,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    before: Annotated[int | None, Query(ge=0, le=MAX_BOUND_INTEGER)] = None,
    before_id: Annotated[str | None, Query(alias="beforeId", max_length=80)] = None,
) -> VoiceOverview:
    recordings, next_page = await kept_recordings(
        env, learner, limit, before, before_id
    )
    next_before, next_before_id = next_page or (None, None)
    return VoiceOverview(
        consent=_consent(await active_consent(env.DB, learner, RECORDINGS)),
        recordings=[Recording(**one) for one in recordings],
        next_before=next_before,
        next_before_id=next_before_id,
    )


@account_voice_router.put("/consent", response_model=ConsentState)
async def agree_to_keep(
    request: Request, uid: Uid, env: EnvDep, learner: LearnerKey, body: ConsentGrant
) -> ConsentState:
    """The parent signed in again just now, with the account this session belongs to."""
    require_known_notice(NOTICE_VERSIONS[RECORDINGS], body.notice_version)
    await require_fresh_sign_in(request, uid, body.firebase_id_token)
    granted = await grant_consent(
        env.DB,
        learner,
        uid,
        RECORDINGS,
        body.notice_version,
        body.retention_days,
        now_ms(),
    )
    return ConsentState(**granted)


@account_voice_router.delete("/consent", response_model=Deleted)
async def stop_keeping(
    env: EnvDep,
    learner: LearnerKey,
    delete_recordings: Annotated[bool, Query(alias="deleteRecordings")] = False,
) -> Deleted:
    """Recordings already kept stay until they expire, unless the parent asks for them to go."""
    await revoke_consent(env.DB, learner, RECORDINGS, now_ms())
    deleted = await delete_kept(env, learner) if delete_recordings else 0
    return Deleted(
        deleted=deleted, more=delete_recordings and await more_kept(env, learner)
    )


@account_voice_router.get("/recordings/{sample_id}/audio", response_model=None)
async def hear_recording(env: EnvDep, learner: LearnerKey, sample_id: SampleId):
    heard = await heard_recording(env, learner, sample_id)
    if heard is None:
        raise refusal(404, "recording_gone", "That recording is not kept")
    audio, content_type = heard
    return Response(
        audio,
        media_type=content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@account_voice_router.delete("/recordings/{sample_id}", status_code=204)
async def delete_one_recording(
    env: EnvDep, learner: LearnerKey, sample_id: SampleId
) -> None:
    await delete_kept(env, learner, sample_id)


@account_voice_router.delete("/recordings", response_model=Deleted)
async def delete_all_recordings(env: EnvDep, learner: LearnerKey) -> Deleted:
    deleted = await delete_kept(env, learner)
    return Deleted(deleted=deleted, more=await more_kept(env, learner))
