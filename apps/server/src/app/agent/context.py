"""Where the learner is, sent by their app as message metadata with each
tutor turn, so the conversation stores only what the learner said. Every
field is optional and capped: a turn without context still gets an answer."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Annotated, Any

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
)

from ..domains.lesson.lesson import Lesson
from ..education.stage import stage_of
from ..learner.record import LearnerRecord
from ..lessons.store import LessonStore

logger = logging.getLogger(__name__)

METADATA_KEY = "learner"
GENERAL_CONVERSATION = (
    "This conversation is not about one topic: the learner may ask about anything."
)
WHOLE_SUBJECT_CONVERSATION = (
    "This conversation is about the subject as a whole, not one of its topics."
)
MAX_TOPICS = 60
MAX_SUBJECTS = 20
MAX_KEY_POINTS = 12
MAX_SLIDES = 20

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
MAX_POINT = 300


def _clipped(max_items: int, max_chars: int):
    """A lesson is the model's writing, of any length, so it is cut to size
    where an identifier over its cap is refused."""

    def clip(value: Any) -> Any:
        if not isinstance(value, list):
            return value
        return [
            " ".join(str(item).split())[:max_chars]
            for item in value[:max_items]
            if isinstance(item, str) and item.strip()
        ]

    return BeforeValidator(clip)


LessonTitle = Annotated[
    str,
    BeforeValidator(lambda value: " ".join(str(value).split())[:200]),
]
KeyPoints = Annotated[list[str], _clipped(MAX_KEY_POINTS, MAX_POINT)]
SlideTitles = Annotated[list[str], _clipped(MAX_SLIDES, 200)]


class SubjectRef(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    name: Title
    slug: Short


class LessonRead(BaseModel):
    """The outline of the lesson the learner has read on this topic."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore", frozen=True)

    title: LessonTitle
    objectives: KeyPoints = Field(default_factory=list)
    key_points: KeyPoints = Field(default_factory=list, alias="keyPoints")
    slides: SlideTitles = Field(default_factory=list)

    @classmethod
    def of(cls, lesson: Lesson) -> LessonRead:
        return cls(
            title=lesson.title,
            objectives=lesson.objectives,
            key_points=lesson.key_points,
            slides=[slide.title for slide in lesson.slides],
        )

    def describe(self) -> list[str]:
        lines = [f"The learner has this topic's lesson, {self.title!r}:"]
        if self.objectives:
            lines.append("What it aims to enable them to do:")
            lines.extend(f"- {objective}" for objective in self.objectives)
        if self.slides:
            lines.append("Its slides, in order:")
            lines.extend(
                f"{index + 1}. {title}" for index, title in enumerate(self.slides)
            )
        if self.key_points:
            lines.append("Its key points:")
            lines.extend(f"- {point}" for point in self.key_points)
        return lines


class LearnerContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore", frozen=True)

    country: Short | None = None
    language: Short | None = None
    grade_level: Short | None = Field(default=None, alias="gradeLevel")
    # The plan the learner's record files this conversation under.
    plan_id: Short | None = Field(default=None, alias="planId")
    subject: Title | None = None
    subject_slug: Short | None = Field(default=None, alias="subjectSlug")
    topic: Title | None = None
    topics: list[Title] = Field(default_factory=list, max_length=MAX_TOPICS)
    subjects: list[SubjectRef] = Field(default_factory=list, max_length=MAX_SUBJECTS)
    # Read from the learner's record, never from the app: see with_kept_lesson.
    lesson: LessonRead | None = None

    @classmethod
    def from_metadata(cls, metadata: Mapping[str, Any] | None) -> LearnerContext:
        """A malformed context is dropped: the learner still gets an answer."""
        raw = (metadata or {}).get(METADATA_KEY)
        if not isinstance(raw, Mapping):
            return cls()
        sent = {key: value for key, value in raw.items() if key != "lesson"}
        try:
            return cls.model_validate(sent)
        except ValidationError:
            logger.warning("Dropped malformed learner context", exc_info=True)
            return cls()

    def describe_learner(self) -> str:
        parts = [
            self.grade_level and f"a {self.grade_level} learner",
            self.country and f"in {self.country}",
            self.language and f"learning in {self.language}",
        ]
        described = " ".join(part for part in parts if part)
        learner = stage_of(self.grade_level)
        if learner is not None:
            described += f"; stage: {learner.described()}"
        return (
            described
            or "Not given: ask only if it matters, and otherwise answer generally."
        )

    def describe_studying(self) -> str:
        lines = (
            [f"The learner's subjects: {', '.join(s.name for s in self.subjects)}"]
            if self.subjects
            else []
        )
        if not self.subject:
            return "\n".join([*lines, GENERAL_CONVERSATION])
        lines.append(f"Subject: {self.subject}")
        lines.append(
            f"This conversation is about: {self.topic}"
            if self.topic
            else WHOLE_SUBJECT_CONVERSATION
        )
        if self.topics:
            lines.append("Topics in this subject, in order:")
            lines.extend(
                f"{index + 1}. {title}" for index, title in enumerate(self.topics)
            )
        # A lesson belongs to one topic; without one it describes nothing here.
        if self.topic and self.lesson:
            lines.extend(self.lesson.describe())
        return "\n".join(lines)


async def with_kept_lesson(
    context: LearnerContext, record: LearnerRecord, lessons: LessonStore
) -> LearnerContext:
    """The context with the lesson the server kept on its topic, if any."""
    if not (context.plan_id and context.subject_slug and context.topic):
        return context
    lesson_id = record.lesson_on(context.plan_id, context.subject_slug, context.topic)
    kept = await lessons.find(lesson_id) if lesson_id else None
    if kept is None:
        return context
    return context.model_copy(update={"lesson": LessonRead.of(kept)})
