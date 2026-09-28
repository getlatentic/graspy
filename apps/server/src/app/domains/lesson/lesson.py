"""A lesson as the learner's app, its views and the tutor read it. Only
pydantic is imported here: worker.py loads this module before it stubs
DSPy's unused parts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ...wire import Wire

SlideType = Literal[
    "concept_introduction",
    "worked_example",
    "scaffolded_problem",
    "misconception",
    "synthesis",
]


class LessonSlideAssessment(BaseModel):
    type: Literal["choice"] = "choice"
    prompt: str = Field(description="The question or task for the student")
    options: list[str] = Field(min_length=2, max_length=5)
    answer_index: int = Field(
        alias="answerIndex", description="Zero-based index of the correct answer"
    )
    # Checks kept on devices by earlier builds have none.
    correct_feedback: str = Field(
        default="",
        alias="correctFeedback",
        description="Encouraging feedback explaining why the answer is correct",
    )
    incorrect_feedback: str = Field(
        default="",
        alias="incorrectFeedback",
        description="Constructive feedback explaining the mistake",
    )

    model_config = ConfigDict(populate_by_name=True)


class LessonSlide(BaseModel):
    slide_type: SlideType = Field(
        alias="slideType", description="The pedagogical type of the slide"
    )
    title: str = Field(description="Concise title of the slide")
    body_md: str = Field(alias="bodyMd", description="Main slide content in Markdown")
    # None for a check taken out because its key could not be made right.
    assessment: LessonSlideAssessment | None

    model_config = ConfigDict(populate_by_name=True)


class LessonPractice(BaseModel):
    question: str = Field(description="Practice question to reinforce learning")
    options: list[str] = Field(min_length=2, max_length=5)
    answer_index: int = Field(
        alias="answerIndex", description="Zero-based index of the correct answer"
    )
    correct_feedback: str = Field(
        alias="correctFeedback",
        description="Encouraging feedback explaining why the answer is correct",
    )
    incorrect_feedback: str = Field(
        alias="incorrectFeedback",
        description="Constructive feedback explaining the mistake",
    )

    model_config = ConfigDict(populate_by_name=True)


class LessonProgress(Wire):
    current: int
    total: int


def _read(model: type[BaseModel], value: Any) -> BaseModel | None:
    if isinstance(value, model):
        return value
    try:
        return model.model_validate(value)
    except ValidationError:
        return None


class Lesson(Wire):
    """Read as the lesson view reads lessons kept by earlier builds: a part
    added since takes its default, one dropped since is ignored, a slide that
    does not read as one is left out, and a practice question without
    options is none."""

    model_config = ConfigDict(extra="ignore")

    title: str
    content: str = ""
    key_points: list[str] = Field(default_factory=list)
    objectives: list[str] = Field(default_factory=list)
    slides: list[LessonSlide] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)
    practice: LessonPractice | None = None
    progress: LessonProgress | None = None

    @field_validator("slides", mode="before")
    @classmethod
    def _readable_slides(cls, value: Any) -> list:
        read = (_read(LessonSlide, slide) for slide in value or [])
        return [slide for slide in read if slide is not None]

    @field_validator("practice", mode="before")
    @classmethod
    def _readable_practice(cls, value: Any) -> LessonPractice | None:
        return _read(LessonPractice, value) if value else None


class FinishedLesson(Wire):
    """An incomplete lesson reports failure, or the client would keep the gap
    as though it were the whole lesson."""

    success: bool
    lesson: Lesson
