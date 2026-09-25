"""An option the learner tapped in a practice card or a lesson's check,
marked from the question's own key and kept on their record."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..caller import Caller
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

    @model_validator(mode="after")
    def _indices_name_options(self) -> PracticeAnswer:
        for index in (self.answer_index, self.chosen_index):
            if not 0 <= index < len(self.options):
                raise ValueError(
                    f"{index} is not one of the {len(self.options)} options"
                )
        return self

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

    def kept(self, source: Literal["practice", "lesson"]) -> Answer:
        return Answer(
            **(self.where or Where()).model_dump(),
            key=self.key,
            source=source,
            question=self.question,
            chosen=self.options[self.chosen_index],
            right=self.options[self.answer_index],
            correct=self.correct,
            at=now_ms(),
        )


class PracticeMark(Wire):
    correct: bool
    answer_index: int
    chosen_index: int


async def answered(
    answer: PracticeAnswer, caller: Caller, source: Literal["practice", "lesson"]
) -> dict:
    """Kept on the learner's record, and marked as MCP's CallToolResult."""
    await caller.change(Answered(answer=answer.kept(source)))
    return {
        "content": [{"type": "text", "text": answer.describe()}],
        "structuredContent": PracticeMark(
            correct=answer.correct,
            answer_index=answer.answer_index,
            chosen_index=answer.chosen_index,
        ).model_dump(by_alias=True),
    }
