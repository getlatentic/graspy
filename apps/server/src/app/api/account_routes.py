"""A signed-in account's learners: list, add, rename and remove them, choose
the one a device learns as, and delete the account with all it kept. Only a
signed-in session reaches these, whichever learner it names."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

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


class NewLearner(BaseModel):
    name: LearnerName
    # Whoever adds a learner is that learner, or their parent or guardian.
    guardian: Literal[True]


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


def _not_found(learner_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"error": f"No learner {learner_id}", "code": "no_such_learner"},
    )


@account_router.get("/learners", response_model=Learners)
async def learners(uid: Uid, keeping: KeepingDep) -> Learners:
    return _listed(await keeping.learners.directory(account_key(uid)))


@account_router.post("/learners", response_model=Learner, status_code=201)
async def add_learner(uid: Uid, keeping: KeepingDep, body: NewLearner) -> Learner:
    try:
        return await added(keeping, uid, body.name, now_ms())
    except TooManyLearners:
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"An account holds at most {MAX_LEARNERS} learners",
                "code": "too_many_learners",
            },
        ) from None


@account_router.patch("/learners/{learner_id}", response_model=Learner)
async def rename_learner(
    uid: Uid, keeping: KeepingDep, learner_id: LearnerId, body: LearnerRename
) -> Learner:
    try:
        return await renamed(keeping, uid, learner_id, body.name)
    except NoSuchLearner:
        raise _not_found(learner_id) from None


@account_router.delete("/learners/{learner_id}", response_model=Learners)
async def remove_learner(
    uid: Uid, keeping: KeepingDep, learner_id: LearnerId
) -> Learners:
    try:
        return _listed(await removed(keeping, uid, learner_id))
    except NoSuchLearner:
        raise _not_found(learner_id) from None


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
        raise _not_found(learner_id) from None
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
