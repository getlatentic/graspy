"""An option the learner tapped in a practice card or a lesson's check,
marked from the question's own key and kept on their record."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..caller import Caller
from ..lessons.ladder import Help, next_help
from ..voice.lesson_store import lesson_day
from ..wire import Wire
from . import record
from .record import Answer, Answered, Key, Where
from .time import now_ms

MIN_OPTIONS = 2
MAX_OPTIONS = 5

Text = Annotated[record.Text, Field(min_length=1)]


class PracticeAnswer(Wire):
    question: Text
    options: list[Text] = Field(min_length=MIN_OPTIONS, max_length=MAX_OPTIONS)
    answer_index: int
    chosen_index: int
    where: Where | None = None
    key: Key | None = None
    # A lesson's check: the slide it is on, and the wrong options already chosen at it, which make this the
    # next try and say what help it was given.
    slide: int | None = Field(default=None, ge=0, le=200)
    tried: list[int] = Field(default_factory=list, max_length=MAX_OPTIONS - 1)

    @model_validator(mode="after")
    def _indices_name_options(self) -> PracticeAnswer:
        for index in (self.answer_index, self.chosen_index, *self.tried):
            if not 0 <= index < len(self.options):
                raise ValueError(
                    f"{index} is not one of the {len(self.options)} options"
                )
        if self.answer_index in self.tried:
            raise ValueError("The right option is not a wrong try")
        return self

    @property
    def attempt(self) -> int:
        return len(set(self.tried)) + 1

    def is_check(self, source: Literal["practice", "lesson"]) -> bool:
        """Whether this answers a lesson's check, which is kept as evidence and given help."""
        return source == "lesson" and self.slide is not None and self.where is not None

    @property
    def correct(self) -> bool:
        return self.chosen_index == self.answer_index

    def describe(self) -> str:
        right = self.options[self.answer_index]
        chosen = self.options[self.chosen_index]
        return "\n".join(
            [
                f"Question: {self.question}",
                "Options:",
                *(
                    f"{index + 1}. {option}"
                    for index, option in enumerate(self.options)
                ),
                f"The right answer: {right}",
                f"The learner chose: {chosen}, which is {'right' if self.correct else 'wrong'}.",
            ]
        )

    def kept(
        self, source: Literal["practice", "lesson"], lesson_id: str | None = None
    ) -> Answer:
        at = now_ms()
        return Answer(
            **(self.where or Where()).model_dump(),
            key=self._key(at) if self.is_check(source) else self.key,
            source=source,
            question=self.question,
            chosen=self.options[self.chosen_index],
            right=self.options[self.answer_index],
            correct=self.correct,
            at=at,
            slide=self.slide,
            lesson_id=lesson_id,
        )

    def _key(self, at: int) -> str | None:
        """A try has its own key, on its own day: the same try sent again replaces itself, and a later
        day's first try never replaces the first try of the day before."""
        if not self.key:
            return None
        return f"{self.key}:{lesson_day(at).isoformat()}:{self.attempt}"

    def help(self, source: Literal["practice", "lesson"]) -> Help | None:
        """What a wrong answer to a lesson's check is given next."""
        if self.correct or not self.is_check(source):
            return None
        wrong = {*self.tried, self.chosen_index}
        return next_help(len(self.options), self.answer_index, wrong)


class HelpMark(Wire):
    kind: str
    keep: list[int] = Field(default_factory=list)


class PracticeMark(Wire):
    correct: bool
    answer_index: int
    chosen_index: int
    help: HelpMark | None = None


async def answered(
    answer: PracticeAnswer, caller: Caller, source: Literal["practice", "lesson"]
) -> dict:
    """Kept on the learner's record, and marked as MCP's CallToolResult."""
    lesson_id = await _lesson_of(answer, caller) if answer.is_check(source) else None
    await caller.change(Answered(answer=answer.kept(source, lesson_id)))
    given = answer.help(source)
    return {
        "content": [{"type": "text", "text": answer.describe()}],
        "structuredContent": PracticeMark(
            correct=answer.correct,
            answer_index=answer.answer_index,
            chosen_index=answer.chosen_index,
            help=HelpMark(kind=given.kind, keep=list(given.keep)) if given else None,
        ).model_dump(by_alias=True, exclude_none=True),
    }


async def _lesson_of(answer: PracticeAnswer, caller: Caller) -> str | None:
    where = answer.where
    if not (where and where.plan_id and where.subject_slug and where.topic):
        return None
    record = await caller.record()
    return record.lesson_on(where.plan_id, where.subject_slug, where.topic)
