"""Lessons, written one slide at a time: a plan, then each slide with the
earlier ones as context, then a practice question.

A Yoruba, Hausa or Igbo lesson is written in English and translated a stage at
a time. A translation that fails leaves that part in English and marks the
lesson incomplete, rather than taking away what the learner already has.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from pydantic import BaseModel

from ...config.languages import generation_language_for, needs_translation
from .generator import StagedLessonGenerator
from .lesson import (
    FinishedLesson,
    Lesson,
    LessonPractice,
    LessonProgress,
    LessonSlide,
)
from .markdown import repair_markdown
from .prompts import LessonPlan, SlideSpec

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LessonRequest:
    country: str
    language: str
    subject: str
    topic: str
    grade_level: str
    learner_notes: str = ""

    @property
    def should_translate(self) -> bool:
        return needs_translation(self.language)

    @property
    def writing_language(self) -> str:
        return generation_language_for(self.language)


@dataclass
class _Draft:
    """Each part as the learner reads it; ``plan`` and ``written`` keep the
    English the later stages are written from."""

    plan: LessonPlan
    shown_plan: LessonPlan
    written: list[LessonSlide] = field(default_factory=list)
    slides: list[LessonSlide] = field(default_factory=list)
    practice: LessonPractice | None = None
    untranslated: list[str] = field(default_factory=list)

    @property
    def complete(self) -> bool:
        return len(self.slides) == len(self.plan.slide_specs) and not self.untranslated


class LessonService:
    def __init__(self):
        self.module = StagedLessonGenerator()

    async def generate_lesson(
        self,
        *,
        country: str,
        language: str,
        subject: str,
        topic: str,
        grade_level: str,
    ) -> FinishedLesson:
        request = LessonRequest(country, language, subject, topic, grade_level)
        async for event in self.events(request):
            if event["type"] == "complete":
                return event["payload"]
        raise RuntimeError("The lesson pipeline ended without a lesson")

    async def events(self, request: LessonRequest) -> AsyncIterator[dict]:
        """The lesson as it is made, ending with a "complete" event whose
        payload is the FinishedLesson."""
        yield _status("planning", "Creating lesson plan...")
        plan = await self.module.generate_plan(
            request.country,
            request.writing_language,
            request.subject,
            request.topic,
            request.grade_level,
            request.learner_notes,
        )
        lesson = _Draft(plan=plan, shown_plan=plan)
        for stage in (self._plan_events, self._slide_events, self._practice_events):
            async for event in stage(request, lesson):
                yield event
        if not lesson.complete:
            logger.warning(
                "Lesson for %s/%s is incomplete: %d of %d slides, untranslated: %s",
                request.subject,
                request.topic,
                len(lesson.slides),
                len(plan.slide_specs),
                ", ".join(lesson.untranslated) or "nothing",
            )
        yield {
            "type": "complete",
            "phase": "complete",
            "payload": _finished(request, lesson),
        }

    async def _plan_events(
        self, request: LessonRequest, lesson: _Draft
    ) -> AsyncIterator[dict]:
        if request.should_translate:
            yield _status(
                "planning", f"Translating the lesson plan to {request.language}..."
            )
            try:
                lesson.shown_plan = await self.module.translate_plan_summary(
                    lesson.plan, request.language
                )
            except Exception:
                logger.exception(
                    "Lesson plan for %s/%s was not translated",
                    request.subject,
                    request.topic,
                )
                lesson.untranslated.append("plan")
                yield _warning(
                    "planning",
                    "The lesson plan could not be translated, so it is shown in English.",
                )
        lesson.shown_plan = _repaired(
            lesson.shown_plan, "learning_objectives", "key_points"
        )
        yield {
            "type": "plan",
            "phase": "generating_slides",
            "payload": lesson.shown_plan,
            "message": f"Plan created: {len(lesson.plan.slide_specs)} slides",
        }

    async def _slide_events(
        self, request: LessonRequest, lesson: _Draft
    ) -> AsyncIterator[dict]:
        total = len(lesson.plan.slide_specs)
        for index, spec in enumerate(lesson.plan.slide_specs):
            yield _status(
                "generating_slides",
                f"Generating slide {index + 1}/{total}: {spec.title}...",
            )
            try:
                original = await self._written_slide(spec, request, lesson)
                # Later slides are written from the untranslated ones.
                lesson.written.append(original)
                if request.should_translate:
                    yield _status(
                        "generating_slides",
                        f"Translating slide {index + 1} to {request.language}...",
                    )
                slide = await self._localise_slide(original, request)
            except Exception:
                # A warning, not an error, which would end the lesson; the
                # provider's detail stays in the log.
                logger.exception(
                    "Slide %d of %s/%s failed",
                    index + 1,
                    request.subject,
                    request.topic,
                )
                yield _warning(
                    "generating_slides", f"Slide {index + 1} could not be written."
                )
                continue
            lesson.slides.append(slide)
            yield {
                "type": "slide",
                "phase": "generating_slides",
                "payload": slide,
                "index": index,
                "total": total,
            }

    async def _written_slide(
        self, spec: SlideSpec, request: LessonRequest, lesson: _Draft
    ) -> LessonSlide:
        """Written once more when the first comes back unusable, as when the
        model writes a table into a check's options: a lesson short of a
        slide is never kept."""
        written = (
            spec,
            request.subject,
            request.topic,
            request.grade_level,
            request.writing_language,
            _context_summary(lesson.written),
            request.country,
        )
        try:
            return await self.module.generate_slide(*written)
        except Exception:
            logger.warning("Slide %r is written again", spec.title, exc_info=True)
            return await self.module.generate_slide(*written, again=True)

    async def _practice_events(
        self, request: LessonRequest, lesson: _Draft
    ) -> AsyncIterator[dict]:
        yield _status("slides_ready", "Slides ready. Finishing touches...")
        yield _status("generating_practice", "Generating practice question...")
        practice = await self.module.generate_practice(
            request.subject,
            request.topic,
            request.grade_level,
            request.writing_language,
            request.country,
            _context_summary(lesson.written),
        )
        if request.should_translate:
            yield _status(
                "generating_practice",
                f"Translating practice question to {request.language}...",
            )
            try:
                practice = await self.module.translate_practice_content(
                    practice, request.language
                )
            except Exception:
                logger.exception(
                    "Practice question for %s/%s was not translated",
                    request.subject,
                    request.topic,
                )
                lesson.untranslated.append("practice question")
                yield _warning(
                    "generating_practice",
                    "The practice question could not be translated, so it is shown in English.",
                )
        lesson.practice = _repaired(practice, *_ANSWERED_TEXT, "question")
        yield {
            "type": "practice",
            "phase": "complete",
            "payload": lesson.practice,
        }

    async def _localise_slide(
        self, slide: LessonSlide, request: LessonRequest
    ) -> LessonSlide:
        if request.should_translate:
            slide = await self.module.translate_slide_content(slide, request.language)
        slide = _repaired(slide, "title", "body_md")
        slide.assessment = _repaired(slide.assessment, *_ANSWERED_TEXT, "prompt")
        return slide


def _status(phase: str, message: str) -> dict:
    return {"type": "status", "phase": phase, "message": message}


def _warning(phase: str, message: str) -> dict:
    return {"type": "warning", "phase": phase, "message": message}


_ANSWERED_TEXT = ("options", "correct_feedback", "incorrect_feedback")


def _repaired[Model: BaseModel](model: Model, *fields: str) -> Model:
    """A copy with the named text fields made renderable."""
    model = model.model_copy(deep=True)
    for name in fields:
        value = getattr(model, name)
        if isinstance(value, list):
            setattr(model, name, [repair_markdown(item) for item in value])
        elif value:
            setattr(model, name, repair_markdown(value))
    return model


def _context_summary(slides: list[LessonSlide]) -> str:
    if not slides:
        return "This is the first slide of the lesson."
    lines = [
        f"{number}. {slide.title}: {slide.assessment.prompt}"
        for number, slide in enumerate(slides, 1)
    ]
    return "Previous slides covered:\n" + "\n".join(lines) + "\n"


def _finished(request: LessonRequest, lesson: _Draft) -> FinishedLesson:
    return FinishedLesson(
        success=lesson.complete,
        lesson=Lesson(
            title=f"{request.topic} - {request.grade_level}",
            content=f"Lesson plan for {request.topic}",
            key_points=lesson.shown_plan.key_points,
            objectives=lesson.shown_plan.learning_objectives,
            slides=lesson.slides,
            practice=lesson.practice,
            progress=LessonProgress(current=0, total=len(lesson.slides) + 1),
        ),
    )
