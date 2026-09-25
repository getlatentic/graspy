"""The learner's record and plan for their app: read the record, keep it in
step with the plan, once bring across what the device kept before the server
did, and share one plan across the learner's devices. The views write the
record through MCP."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import (
    Field,
    ValidationError,
    ValidatorFunctionWrapHandler,
    WrapValidator,
)

from ..caller import Caller
from ..domains.lesson.lesson import Lesson
from ..learner.plan import MAX_PLAN_CHARS, Plan, joined, newer
from ..learner.record import (
    MAX_ANSWERS,
    MAX_TOPICS,
    Answer,
    Imported,
    PlanChange,
    TopicMark,
    TopicRef,
)
from ..learner.time import now_ms
from ..security.guard import Session, require_session
from ..wire import Wire

# More than any device kept: it kept the current plan's lessons only.
MAX_IMPORTED_LESSONS = 100
MAX_LESSON_CHARS = 200_000

logger = logging.getLogger(__name__)

learner_router = APIRouter(tags=["learner"])

PlanId = Annotated[str, Query(alias="planId", min_length=1, max_length=80)]


def _sized_and_read(lesson: Any, read: ValidatorFunctionWrapHandler) -> Lesson | None:
    """A lesson over the size limit refuses the import; one that does not
    read, or has no slide, is left out of it."""
    if len(json.dumps(lesson)) > MAX_LESSON_CHARS:
        raise ValueError(f"A lesson is at most {MAX_LESSON_CHARS} characters")
    try:
        kept = read(lesson)
    except ValidationError:
        kept = None
    if kept is None or not kept.slides:
        logger.warning("A lesson the device kept is malformed and is left out")
        return None
    return kept


class KeptLesson(Wire):
    topic: TopicRef
    lesson: Annotated[Lesson | None, WrapValidator(_sized_and_read)]


class DeviceRecords(Wire):
    """Every lesson is kept again under a new id: one the device had may have
    been dropped since."""

    topics: list[TopicMark] = Field(default_factory=list, max_length=MAX_TOPICS)
    answers: list[Answer] = Field(default_factory=list, max_length=MAX_ANSWERS)
    lessons: list[KeptLesson] = Field(
        default_factory=list, max_length=MAX_IMPORTED_LESSONS
    )


async def learner_caller(
    request: Request, session: Annotated[Session, Depends(require_session)]
) -> Caller:
    if not session.learner:
        raise HTTPException(
            status_code=400,
            detail={"error": "This session names no device", "code": "no_device"},
        )
    return Caller(session.learner, request.app.state.keeping)


CallerDep = Annotated[Caller, Depends(learner_caller)]


@learner_router.get("/learner", response_model=None)
async def learner_record(caller: CallerDep, plan_id: PlanId) -> dict:
    return (await caller.record()).for_app(plan_id)


@learner_router.post("/learner/import", response_model=None)
async def import_records(caller: CallerDep, records: DeviceRecords) -> dict:
    """Once: a second import changes nothing, so the app may send again."""
    if (await caller.record()).imported:
        return {"imported": False}
    topics = list(records.topics)
    for kept in records.lessons:
        if kept.lesson is None:
            continue
        lesson_id = uuid.uuid4().hex
        await caller.keeping.lessons.keep(lesson_id, kept.lesson)
        topics.append(TopicMark(**kept.topic.model_dump(), lesson_id=lesson_id))
    await caller.change(Imported(topics=topics, answers=records.answers))
    return {"imported": True}


@learner_router.post("/learner/plan", response_model=None)
async def change_plan(caller: CallerDep, change: Annotated[PlanChange, Body()]) -> dict:
    await caller.change(change)
    return {"changed": True}


async def _stored_plan(caller: Caller) -> Plan | None:
    stored = await caller.keeping.learners.plan(caller.learner)
    return Plan.model_validate_json(stored) if stored else None


async def _sent_plan(request: Request) -> Plan:
    body = await request.body()
    if len(body) > MAX_PLAN_CHARS:
        raise HTTPException(status_code=413, detail="The plan is too large")
    try:
        return Plan.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail="The plan is malformed") from error


@learner_router.get("/learner/curriculum", response_model=None)
async def shared_plan(caller: CallerDep) -> dict:
    plan = await _stored_plan(caller)
    return {"plan": plan.model_dump(by_alias=True) if plan else None}


@learner_router.put("/learner/curriculum", response_model=None)
async def keep_plan(caller: CallerDep, request: Request) -> dict:
    """The newer plan wins; a device sending an older one gets the newer back."""
    kept = newer(await _stored_plan(caller), await _sent_plan(request))
    await caller.keeping.learners.keep_plan(caller.learner, kept.json())
    return {"plan": kept.model_dump(by_alias=True)}


@learner_router.post("/learner/curriculum/join", response_model=None)
async def join_plan(caller: CallerDep, request: Request) -> dict:
    """A device's first sign-in: its plan and the account's become one."""
    result = joined(await _stored_plan(caller), await _sent_plan(request), now_ms())
    await caller.keeping.learners.keep_plan(caller.learner, result.plan.json())
    if result.carried:
        await caller.change(result.carried)
    return {"plan": result.plan.model_dump(by_alias=True)}
