"""A learner's tutor conversations, shared by their devices: each device sends
what it has not sent, then reads what changed since it last read. Only an
account's learner keeps them here; a device signed out keeps its own."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..account.directory import learner_key
from ..account.learners import NoSuchLearner, learner_of
from ..caller import Keeping
from ..security.guard import Session, require_session
from ..threads.store import BadCursor
from ..threads.wire import SentThreads

# More than MAX_SENT_MESSAGES messages of the largest size a device keeps.
MAX_SENT_CHARS = 4_000_000

thread_router = APIRouter(prefix="/learner/threads", tags=["threads"])


@dataclass(frozen=True)
class AccountLearner:
    uid: str
    learner_id: str

    @property
    def key(self) -> str:
        return learner_key(self.uid, self.learner_id)


async def _account_learner(
    session: Annotated[Session, Depends(require_session)],
) -> AccountLearner:
    if not session.account:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Sign in to keep conversations",
                "code": "account_required",
            },
        )
    prefix = learner_key(session.account, "")
    if not session.learner or not session.learner.startswith(prefix):
        raise HTTPException(
            status_code=409,
            detail={"error": "Choose a learner first", "code": "learner_required"},
        )
    return AccountLearner(session.account, session.learner[len(prefix) :])


LearnerDep = Annotated[AccountLearner, Depends(_account_learner)]


def _keeping(request: Request) -> Keeping:
    return request.app.state.keeping


async def _sent(request: Request) -> SentThreads:
    body = await request.body()
    if len(body) > MAX_SENT_CHARS:
        raise HTTPException(status_code=413, detail="Too much sent at once")
    return SentThreads.model_validate_json(body)


@thread_router.post("", response_model=None)
async def keep_threads(learner: LearnerDep, request: Request) -> dict:
    """A learner removed from the account keeps nothing more, even from a
    session issued before."""
    keeping = _keeping(request)
    sent = await _sent(request)
    try:
        await learner_of(keeping, learner.uid, learner.learner_id)
    except NoSuchLearner:
        raise HTTPException(
            status_code=404,
            detail={"error": "No such learner", "code": "no_such_learner"},
        ) from None
    return {"seq": await keeping.threads.keep(learner.key, sent.threads)}


@thread_router.get("", response_model=None)
async def changed_threads(
    learner: LearnerDep,
    request: Request,
    since: Annotated[int, Query(ge=0)] = 0,
    up_to: Annotated[int | None, Query(alias="upTo", ge=0)] = None,
    after: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    try:
        changes = await _keeping(request).threads.changes(
            learner.key, since, up_to, after
        )
    except BadCursor:
        raise HTTPException(status_code=422, detail="Unknown cursor") from None
    return changes.model_dump(by_alias=True)
