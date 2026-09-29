"""A signed-in account's learners: list, add, rename and remove them, choose
the one a device learns as, and delete the account with all it kept. Only a
signed-in session reaches these, whichever learner it names."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..account.consents import NOTICE_VERSIONS, SERVICE, grant_consent
from ..account.directory import (
    MAX_LEARNERS,
    Directory,
    Learner,
    LearnerId,
    LearnerName,
    account_key,
    learner_key,
)
from ..account.learners import (
    NoSuchLearner,
    TooManyLearners,
    added,
    closed,
    learner_of,
    removed,
    renamed,
)
from ..caller import Caller, Keeping
from ..learner.record import DeviceJoined
from ..learner.time import now_ms
from ..security.guard import Session, require_session
from ..wire import Wire
from .consent_proof import refusal, require_fresh_sign_in, require_known_notice
from .listed_learners import (
    ListedLearner,
    ListedLearners,
    listed,
    listed_with_consents,
)
from .routes import SessionResponse, learner_session

account_router = APIRouter(prefix="/account", tags=["account"])


async def _account(session: Annotated[Session, Depends(require_session)]) -> str:
    if not session.account:
        raise HTTPException(
            status_code=403,
            detail={"error": "Sign in to manage learners", "code": "account_required"},
        )
    return session.account


Uid = Annotated[str, Depends(_account)]


async def _keeping(request: Request) -> Keeping:
    return request.app.state.keeping


KeepingDep = Annotated[Keeping, Depends(_keeping)]


class ServiceConsentGrant(Wire):
    """The parent's agreement to graspy teaching the learner, with their fresh sign-in."""

    notice_version: int
    firebase_id_token: str = Field(max_length=4096)


class NewLearner(BaseModel):
    name: LearnerName
    # Whoever adds a learner is that learner, or their parent or guardian.
    guardian: Literal[True]
    # Without it the learner is added and no consent is recorded.
    consent: ServiceConsentGrant | None = None


class LearnerRename(BaseModel):
    name: LearnerName


class Chosen(BaseModel):
    # The device's first choice after signing in: its own record joins the learner.
    device_id: str | None = Field(
        default=None, alias="deviceId", pattern=r"^[A-Za-z0-9_-]{8,64}$"
    )


class Learners(BaseModel):
    learners: list[Learner]


def _listed(directory: Directory) -> Learners:
    return Learners(learners=directory.learners)


def no_such_learner(learner_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"error": f"No learner {learner_id}", "code": "no_such_learner"},
    )


@account_router.get("/learners", response_model=ListedLearners)
async def learners(request: Request, uid: Uid, keeping: KeepingDep) -> ListedLearners:
    directory = await keeping.learners.directory(account_key(uid))
    return await listed_with_consents(request.app.state.voice, uid, directory)


async def _proved(request: Request, uid: Uid, consent: ServiceConsentGrant) -> None:
    """A consent sent with a new learner is checked before the learner is added."""
    require_known_notice(NOTICE_VERSIONS[SERVICE], consent.notice_version)
    if request.app.state.voice is None:
        raise refusal(503, "consent_unavailable", "Consent cannot be kept here")
    await require_fresh_sign_in(request, uid, consent.firebase_id_token)


@account_router.post("/learners", response_model=ListedLearner, status_code=201)
async def add_learner(
    request: Request, uid: Uid, keeping: KeepingDep, body: NewLearner
) -> ListedLearner:
    if body.consent is not None:
        await _proved(request, uid, body.consent)
    try:
        learner = await added(keeping, uid, body.name, now_ms())
    except TooManyLearners:
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"An account holds at most {MAX_LEARNERS} learners",
                "code": "too_many_learners",
            },
        ) from None
    if body.consent is None:
        return listed(learner, {})
    granted = await grant_consent(
        request.app.state.voice.DB,
        learner_key(uid, learner.id),
        uid,
        SERVICE,
        body.consent.notice_version,
        None,
        now_ms(),
    )
    return listed(learner, {SERVICE: granted})


@account_router.patch("/learners/{learner_id}", response_model=Learner)
async def rename_learner(
    uid: Uid, keeping: KeepingDep, learner_id: LearnerId, body: LearnerRename
) -> Learner:
    try:
        return await renamed(keeping, uid, learner_id, body.name)
    except NoSuchLearner:
        raise no_such_learner(learner_id) from None


@account_router.delete("/learners/{learner_id}", response_model=Learners)
async def remove_learner(
    uid: Uid, keeping: KeepingDep, learner_id: LearnerId
) -> Learners:
    try:
        return _listed(await removed(keeping, uid, learner_id))
    except NoSuchLearner:
        raise no_such_learner(learner_id) from None


@account_router.post("/learners/{learner_id}/session", response_model=SessionResponse)
async def choose_learner(
    request: Request,
    uid: Uid,
    keeping: KeepingDep,
    learner_id: LearnerId,
    body: Chosen | None = None,
) -> SessionResponse:
    try:
        learner = await learner_of(keeping, uid, learner_id)
    except NoSuchLearner:
        raise no_such_learner(learner_id) from None
    if body and body.device_id:
        device = await Caller(body.device_id, keeping).record()
        await Caller(learner_key(uid, learner.id), keeping).change(
            DeviceJoined(
                device=body.device_id, topics=device.topics, answers=device.answers
            )
        )
    return learner_session(request, uid, learner)


@account_router.delete("", status_code=204)
async def delete_account(uid: Uid, keeping: KeepingDep) -> None:
    """Every learner and everything kept for them. The Google account itself
    is Google's."""
    await closed(keeping, uid)
