"""A lesson being made apart from any request: opening the topic again joins
it rather than paying for a second. Decided here, as JSON text, so the Durable
Object that makes lessons holds no logic of its own."""

from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from ..domains.lesson.lesson import Lesson, LessonProgress
from ..learner.record import TopicRef
from ..wire import Wire

# Slides arrive every few seconds, so a lesson this quiet was lost, and
# opening the topic starts it again.
STALE_MS = 5 * 60 * 1000
FORGET_MS = 24 * 60 * 60 * 1000

Short = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class LessonTarget(TopicRef):
    subject: Title
    total_topics: int = Field(ge=1, le=500)
    country: Short
    language: Short
    grade_level: Short | None = None
    # For the topic a learner asked to learn, reached by a path: the steps
    # before it they have not studied, which the lesson recaps as it needs.
    builds_on: list[Title] = Field(default_factory=list, max_length=12)

    def ref(self) -> TopicRef:
        return TopicRef.model_validate(self.model_dump())

    def key(self, learner: str | None) -> str:
        """One per learner and topic: each lesson is aimed at the learner's
        own record. Learning a step first does not make another lesson."""
        named = json.dumps(
            [learner or "", self.model_dump(by_alias=True, exclude={"builds_on"})],
            sort_keys=True,
        )
        return hashlib.sha256(named.encode()).hexdigest()[:40]


class Job(Wire):
    learner: str | None = None
    target: LessonTarget
    attempt: int = 0
    notes: str = ""


class Making(Wire):
    status: Literal["making", "ready", "failed"]
    attempt: int = 0
    lesson: Lesson | None = None
    lesson_id: str | None = None
    # False for a lesson that lost a slide or a translation: shown, but not
    # kept, so the gap does not become permanent.
    whole: bool = False
    updated_at: int = 0


def _restartable(making: Making, attempt: int, now: int) -> bool:
    stale = now - making.updated_at > STALE_MS
    match making.status:
        case "ready":
            return False
        case "making":
            return stale
        case "failed":
            return attempt > making.attempt or stale


def started(stored: str | None, job_json: str, now: int) -> tuple[str, bool]:
    """What a request for the lesson is answered with, and whether its job
    must run."""
    job = Job.model_validate_json(job_json)
    if stored and not _restartable(
        Making.model_validate_json(stored), job.attempt, now
    ):
        return stored, False
    making = Making(
        status="making",
        attempt=job.attempt,
        lesson=empty_lesson(job.target),
        updated_at=now,
    )
    return making.model_dump_json(by_alias=True), True


def making_now(stored: str | None) -> bool:
    return bool(stored) and Making.model_validate_json(stored).status == "making"


def empty_lesson(target: LessonTarget) -> Lesson:
    return Lesson(
        title=target.topic,
        progress=LessonProgress(current=target.topic_index, total=target.total_topics),
    )
