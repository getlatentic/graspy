"""The cards a tutor's reply can carry: tool results with UI, shaped as MCP
Apps shapes them, each kind with its own ui:// resource and view."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from ..learner.record import Where
from ..wire import Wire

PRACTICE_UI = "ui://graspy/practice"
PASSAGE_UI = "ui://graspy/passage"
DESCRIBED_PASSAGE = 600


class Question(Wire):
    question: str
    options: list[str]
    answer_index: int
    correct_feedback: str
    incorrect_feedback: str
    hint: str

    def describe(self, number: int) -> str:
        options = (f"   {i + 1}. {o}" for i, o in enumerate(self.options))
        return "\n".join(
            [
                f"{number}. {self.question}",
                *options,
                f"   The right answer: {self.options[self.answer_index]}",
            ]
        )


def _questions(questions: list[Question]) -> list[str]:
    return [question.describe(n) for n, question in enumerate(questions, 1)]


class PracticeSet(Wire):
    instruction: str
    questions: list[Question]

    def describe(self) -> str:
        return "\n".join([self.instruction, *_questions(self.questions)]).strip()


class Passage(Wire):
    instruction: str
    title: str
    passage: str
    questions: list[Question]

    def describe(self) -> str:
        start = self.passage[:DESCRIBED_PASSAGE]
        more = "…" if len(self.passage) > DESCRIBED_PASSAGE else ""
        return "\n".join(
            [
                self.instruction,
                f"Passage: {self.title}",
                start + more,
                *_questions(self.questions),
            ]
        ).strip()


class TextContent(Wire):
    type: Literal["text"] = "text"
    text: str


class ResultMeta(Wire):
    # The key the view keeps the learner's state under between visits.
    view_uuid: str = Field(alias="viewUUID")
    # Sent back with each answer, so the record files it there.
    where: Where | None = None


class PracticeResult(Wire):
    """MCP's CallToolResult: text for a host without UI, and the structured
    content the view renders."""

    content: list[TextContent]
    structured_content: PracticeSet
    meta: ResultMeta = Field(alias="_meta")


class PassageResult(Wire):
    content: list[TextContent]
    structured_content: Passage
    meta: ResultMeta = Field(alias="_meta")


class PracticeCard(Wire):
    """Rendered as an MCP Apps host renders a tool result: the resource in a
    sandboxed frame, sent the tool's input and then its result."""

    resource_uri: Literal["ui://graspy/practice"] = PRACTICE_UI
    tool_name: Literal["give_practice"] = "give_practice"
    tool_input: dict[str, Any]
    tool_result: PracticeResult

    def describe(self) -> str:
        return self.tool_result.structured_content.describe()


class PassageCard(Wire):
    resource_uri: Literal["ui://graspy/passage"] = PASSAGE_UI
    tool_name: Literal["give_passage"] = "give_passage"
    tool_input: dict[str, Any]
    tool_result: PassageResult

    def describe(self) -> str:
        return self.tool_result.structured_content.describe()


Card = Annotated[PracticeCard | PassageCard, Field(discriminator="resource_uri")]


def placed(card: Card, where: Where) -> Card:
    result = card.tool_result
    meta = result.meta.model_copy(update={"where": where})
    return card.model_copy(
        update={"tool_result": result.model_copy(update={"meta": meta})}
    )
