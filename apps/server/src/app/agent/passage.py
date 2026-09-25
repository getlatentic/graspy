"""Reading practice: a passage the tutor writes, and questions on it. Each
question names its evidence, the passage's own words that answer it, and one
whose evidence is not in the passage is refused."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from .cards import (
    Passage,
    PassageCard,
    PassageResult,
    Question,
    ResultMeta,
    TextContent,
)
from .choices import (
    CARD_TOLD,
    clean,
    count_problem,
    options_problem,
    plain,
    refused,
    shown,
)
from .reply import Outcome

MIN_PASSAGE = 200
MAX_PASSAGE = 4000
MAX_TITLE = 120


class PassageQuestion(BaseModel):
    question: str = Field(description="The question about the passage.")
    evidence: str = Field(
        description="The words in the passage that give the answer, copied "
        "exactly: a phrase or a sentence."
    )
    options: list[str] = Field(
        description="3 or 4 different answers: the one the passage gives, and "
        "plausible misreadings."
    )
    answer_index: int = Field(
        description="The position of the right answer in options, from 0."
    )
    correct_feedback: str = Field(
        description="Why it is right, pointing to the passage."
    )
    incorrect_feedback: str = Field(
        description="Where in the passage to look again, without giving the answer away."
    )
    hint: str = Field(default="", description="A nudge towards the right part.")


def _checked(written: PassageQuestion, passage: str) -> Question | str:
    """The question as the card shows it, or why it cannot be."""
    choices = [clean(option) for option in written.options if clean(option)]
    problem = options_problem(clean(written.question), choices, written.answer_index)
    if problem:
        return problem
    if not plain(written.evidence) or plain(written.evidence) not in plain(passage):
        return (
            f"The evidence {written.evidence!r} is not in the passage. Copy the "
            "passage's own words that answer the question."
        )
    return shown(written, choices)


def _passage_problem(title: str, passage: str) -> str | None:
    if not title:
        return "The passage needs a title."
    if not MIN_PASSAGE <= len(passage) <= MAX_PASSAGE:
        return (
            f"Write a passage of {MIN_PASSAGE} to {MAX_PASSAGE} characters; "
            f"this one has {len(passage)}."
        )
    return None


def give_passage(
    instruction: str, title: str, passage: str, questions: list[PassageQuestion]
) -> dict | Outcome:
    """Give the learner reading practice as a card: a passage to read, and
    multiple-choice questions on it that they answer by tapping. Use it when they
    ask for comprehension or reading practice, or for a passage with questions.
    Write the passage yourself, at their level and in their language unless
    they are learning another, with names and places from their country. Every
    question must be answered by the passage.

    Args:
        instruction: One line telling the learner what to do, e.g. "Read the
            passage, then answer the questions."
        title: The passage's title.
        passage: The passage, in paragraphs separated by blank lines.
        questions: One to five questions on it, in the order they are answered.
    """
    text = passage.strip()
    problem = _passage_problem(clean(title, MAX_TITLE), text) or count_problem(
        questions
    )
    if problem:
        return {"error": problem}
    checked = [_checked(written, text) for written in questions]
    if any(isinstance(result, str) for result in checked):
        return refused(checked, "give_passage")
    content = Passage(
        instruction=clean(instruction),
        title=clean(title, MAX_TITLE),
        passage=text,
        questions=[result for result in checked if isinstance(result, Question)],
    )
    tool_input = {
        "instruction": instruction,
        "title": title,
        "passage": passage,
        "questions": [written.model_dump() for written in questions],
    }
    return _carded(content, tool_input)


def _carded(content: Passage, tool_input: dict) -> Outcome:
    return Outcome(
        told={
            "done": CARD_TOLD.format(
                what="the passage and its questions",
                never="the passage, the questions, their options or answers",
            )
        },
        card=PassageCard(
            tool_input=tool_input,
            tool_result=PassageResult(
                content=[TextContent(text=content.describe())],
                structured_content=content,
                meta=ResultMeta(view_uuid=uuid.uuid4().hex),
            ),
        ),
    )
