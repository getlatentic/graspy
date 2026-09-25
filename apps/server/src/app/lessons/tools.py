"""The lesson as an MCP App: the host opens it with give_lesson, and its view
calls the rest."""

from __future__ import annotations

from pydantic import Field

from ..app_tool import AppTool
from ..caller import Caller
from ..domains.lesson.lesson import Lesson
from ..learner.answers import PracticeAnswer, answered
from ..learner.notes import notes_for
from ..learner.record import LearnerRecord, Learnt, TopicRef
from ..learner.time import now_ms
from ..wire import Wire
from .making import Job, LessonTarget, Making

LESSON_UI = "ui://graspy/lesson"


class LessonAsk(Wire):
    target: LessonTarget
    # Raised to ask again after a failure; the same attempt joins the failure
    # rather than paying again.
    attempt: int = Field(default=0, ge=0, le=100)


class LessonView(Wire):
    status: str
    lesson: Lesson | None
    whole: bool
    attempt: int
    target: LessonTarget


async def _kept(
    target: LessonTarget, caller: Caller, record: LearnerRecord
) -> Making | None:
    mark = record.mark(target.ref())
    if not mark or not mark.lesson_id:
        return None
    lesson = await caller.keeping.lessons.find(mark.lesson_id)
    if lesson is None:
        return None
    return Making(
        status="ready",
        lesson=lesson,
        lesson_id=mark.lesson_id,
        whole=True,
        updated_at=now_ms(),
    )


def _told(making: Making) -> str:
    slides = len(making.lesson.slides) if making.lesson else 0
    match making.status:
        case "ready":
            return f"The lesson is ready: {slides} slides."
        case "making":
            return f"The lesson is being made: {slides} slides so far."
    return "The lesson could not be made. Ask for it again."


def _result(target: LessonTarget, making: Making, caller: Caller) -> dict:
    view = LessonView(
        status=making.status,
        lesson=making.lesson,
        whole=making.whole,
        attempt=making.attempt,
        target=target,
    )
    return {
        "content": [{"type": "text", "text": _told(making)}],
        "structuredContent": view.model_dump(by_alias=True),
        # The view keeps the learner's place in the lesson under this key.
        "_meta": {"viewUUID": target.key(caller.learner)},
    }


def _notes(record: LearnerRecord, target: LessonTarget) -> str:
    notes = notes_for(record, target.plan_id, target.subject_slug)
    if not target.builds_on:
        return notes
    return (
        f"{notes}\nThe learner asked to learn this topic itself. They have not "
        f"studied the topics that lead up to it: {'; '.join(target.builds_on)}. "
        "Recap briefly only what this lesson needs from them, then teach it."
    )


async def give_lesson(ask: LessonAsk, caller: Caller) -> dict:
    target = ask.target
    record = await caller.record()
    making = await _kept(target, caller, record)
    if making is None:
        job = Job(
            learner=caller.learner,
            target=target,
            attempt=ask.attempt,
            notes=_notes(record, target),
        )
        making = await caller.keeping.making.start(target.key(caller.learner), job)
    return _result(target, making, caller)


async def lesson_progress(ask: LessonAsk, caller: Caller) -> dict:
    target = ask.target
    making = await _kept(target, caller, await caller.record())
    making = making or await caller.keeping.making.progress(target.key(caller.learner))
    # Nothing under the key: never asked for here, or its maker has gone.
    return _result(target, making or Making(status="failed"), caller)


async def finish_lesson(topic: TopicRef, caller: Caller) -> dict:
    await caller.change(Learnt(topic=topic, at=now_ms()))
    return {
        "content": [{"type": "text", "text": f"{topic.topic} is finished."}],
        "structuredContent": {"learnt": True},
    }


LESSON_TOOLS: tuple[AppTool, ...] = (
    AppTool(
        "give_lesson",
        "Open a topic's lesson: the one the learner has, the one being made, "
        "or a new one made for them.",
        LessonAsk,
        give_lesson,
        resource_uri=LESSON_UI,
    ),
    AppTool(
        "lesson_progress",
        "The topic's lesson as far as it has arrived. Never starts one.",
        LessonAsk,
        lesson_progress,
    ),
    AppTool(
        "answer_check",
        "Mark the option the learner chose on a lesson's check, and keep it "
        "on their record.",
        PracticeAnswer,
        lambda answer, caller: answered(answer, caller, "lesson"),
    ),
    AppTool(
        "finish_lesson",
        "Mark the topic finished on the learner's record.",
        TopicRef,
        finish_lesson,
    ),
)
