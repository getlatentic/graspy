"""Making one lesson: saved at each step for whoever is reading, then kept
and filed on the learner's record."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import dspy

from ..config.generation import DEFAULT_GRADE_LEVEL
from ..domains.lesson.lesson import FinishedLesson, Lesson
from ..domains.lesson.service import LessonRequest, LessonService
from ..learner.record import LessonKept
from ..learner.store import LearnerStore
from ..learner.time import now_ms
from .making import Job, Making, empty_lesson
from .store import LessonStore

logger = logging.getLogger(__name__)

Save = Callable[[Making], Awaitable[None]]


def _request(job: Job) -> LessonRequest:
    target = job.target
    return LessonRequest(
        country=target.country,
        language=target.language,
        subject=target.subject,
        topic=target.topic,
        grade_level=target.grade_level or DEFAULT_GRADE_LEVEL,
        learner_notes=job.notes,
    )


def _grown(lesson: Lesson, event: dict) -> Lesson | None:
    """None for an event that adds nothing the learner reads."""
    payload = event.get("payload")
    match event["type"]:
        case "plan":
            return lesson.model_copy(
                update={
                    "objectives": payload.learning_objectives,
                    "key_points": payload.key_points,
                }
            )
        case "slide":
            return lesson.model_copy(update={"slides": [*lesson.slides, payload]})
        case "practice":
            return lesson.model_copy(update={"practice": payload})
    return None


@dataclass(frozen=True)
class LessonRunner:
    service: LessonService
    lessons: LessonStore
    learners: LearnerStore
    # For a run outside any request; a model already in context wins.
    lm: dspy.LM | None = None

    async def __call__(self, job: Job, save: Save) -> None:
        with dspy.context(lm=dspy.settings.lm or self.lm):
            await self._run(job, save)

    async def _run(self, job: Job, save: Save) -> None:
        def at(status: str, lesson: Lesson, **rest) -> Making:
            return Making(
                status=status,
                attempt=job.attempt,
                lesson=lesson,
                updated_at=now_ms(),
                **rest,
            )

        lesson = empty_lesson(job.target)
        try:
            async for event in self.service.events(_request(job)):
                if event["type"] == "complete":
                    await save(await self._finished(job, event["payload"], at))
                    return
                grown = _grown(lesson, event)
                if grown is not None:
                    lesson = grown
                    await save(at("making", lesson))
        except Exception:
            logger.exception("Making the lesson on %s failed", job.target.topic)
        await save(at("failed", lesson))

    async def _finished(self, job: Job, finished: FinishedLesson, at) -> Making:
        lesson = finished.lesson
        if not finished.success:
            return at("ready", lesson)
        lesson_id = uuid.uuid4().hex
        await self.lessons.keep(lesson_id, lesson)
        if job.learner:
            await self.learners.change(
                job.learner, LessonKept(topic=job.target.ref(), lesson_id=lesson_id)
            )
        return at("ready", lesson, lesson_id=lesson_id, whole=True)
