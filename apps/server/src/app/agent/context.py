"""Where the learner is, sent by their app as message metadata with each
tutor turn, so the conversation stores only what the learner said. Every
field is optional and capped: a turn without context still gets an answer."""

from __future__ import annotations

import logging
import re
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
from ..education.catalogue import countries
from ..education.stage import stage_of
from ..learner.record import LearnerRecord
from ..lessons.store import LessonStore
from .subject_match import normalise

logger = logging.getLogger(__name__)

METADATA_KEY = "learner"
GENERAL_CONVERSATION = (
    "This conversation is not about one topic: the learner may ask about anything."
)
NO_SUBJECTS_CONVERSATION = (
    "The learner has no subjects yet. The app asks a new learner what they would "
    "like to learn; if they have not said, ask."
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


COUNTRY_CODE = re.compile(r"[A-Za-z]{2}")


def _country_code(value: Any) -> str | None:
    if isinstance(value, str) and COUNTRY_CODE.fullmatch(value.strip()):
        return value.strip().upper()
    return None


def _catalogued(value: Any) -> str | None:
    """A country code the catalogue has a school system for, else nothing."""
    code = _country_code(value)
    return code if code in countries() else None


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
    # The country's ISO code, which finds its school classes; one that is not a
    # code is left out, not the whole context.
    country_code: Annotated[str | None, BeforeValidator(_country_code)] = Field(
        default=None, alias="countryCode"
    )
    # Where the form starts when the learner has not said their country. The edge's is set by the
    # server from the request (edge_country.py), never read from what an app sends; the device's
    # is the app's guess from its own settings, used only when the edge has none.
    edge_country: Annotated[str | None, BeforeValidator(_catalogued)] = Field(
        default=None, alias="edgeCountry"
    )
    device_country: Annotated[str | None, BeforeValidator(_catalogued)] = Field(
        default=None, alias="deviceCountry"
    )
    language: Short | None = None
    grade_level: Short | None = Field(default=None, alias="gradeLevel")
    # Sent by an app whose learner's plan has no subjects yet.
    empty_plan: bool = Field(default=False, alias="emptyPlan")
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
        # The lesson is the server's to read, and so is the edge's country: never an app's word.
        sent = {
            key: value
            for key, value in raw.items()
            if key not in {"lesson", "edgeCountry"}
        }
        try:
            return cls.model_validate(sent)
        except ValidationError:
            logger.warning("Dropped malformed learner context", exc_info=True)
            return cls()

    def with_edge_country(self, code: str | None) -> LearnerContext:
        """The learner with the country the edge placed the connection in, if the catalogue has it."""
        return self.model_copy(update={"edge_country": _catalogued(code)})

    def needs_class(self) -> bool:
        """A new learner whose class is not given: what is written for them
        follows their class, so nothing is offered before it."""
        return self.empty_plan and not self.grade_level

    def held_subjects(self) -> list[SubjectRef]:
        """Their subjects, with the open one even when the app did not list it."""
        subjects = list(self.subjects)
        if (
            self.subject
            and self.subject_slug
            and self.subject_slug not in {s.slug for s in subjects}
            and normalise(self.subject) not in {normalise(s.name) for s in subjects}
        ):
            subjects.append(SubjectRef(name=self.subject, slug=self.subject_slug))
        return subjects

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
            return "\n".join(
                [*lines, GENERAL_CONVERSATION]
                if self.subjects or not self.empty_plan
                else [NO_SUBJECTS_CONVERSATION, GENERAL_CONVERSATION]
            )
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
