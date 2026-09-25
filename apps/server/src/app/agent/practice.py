"""Practice questions as a card the app marks from its own key, so the key is
checked before the card is shown: the model can mark 0.75 right for 7/8, or
offer 15, 15.0 and 15.00 as different answers."""

from __future__ import annotations

import re
import uuid

from pydantic import BaseModel, Field

from .cards import (
    PracticeCard,
    PracticeResult,
    PracticeSet,
    Question,
    ResultMeta,
    TextContent,
)
from .choices import (
    CARD_TOLD,
    agrees,
    clean,
    count_problem,
    number,
    options_problem,
    plain,
    refused,
    shown,
)
from .reply import Outcome
from .sandbox import CalculationError, evaluate


class PracticeQuestion(BaseModel):
    question: str = Field(description="The question, complete on its own.")
    working: str = Field(
        description="The solution worked step by step, ending with the answer "
        "exactly as it appears among the options."
    )
    options: list[str] = Field(
        description="3 or 4 different answers: the one the working reaches, and "
        "plausible mistakes. Never the same answer written two ways."
    )
    answer_index: int = Field(
        description="The position of the right answer in options, from 0."
    )
    correct_feedback: str = Field(
        description="Why the right answer is right, in a sentence or two."
    )
    incorrect_feedback: str = Field(
        description="The usual mistake and how to fix it, without giving the answer away."
    )
    check: str = Field(
        default="",
        description="When the answer is a number, plain arithmetic that gives it, "
        "such as 7/12 or 120/8; the app works it out and refuses a key it disagrees with.",
    )
    hint: str = Field(
        default="", description="A nudge towards the method, not the answer."
    )


_NUMBERS_IN = re.compile(r"\\d?frac\{\d+\}\{\d+\}|\d+\s*/\s*\d+|\d+(?:\.\d+)?")


def _reaches(working: str, answer: str) -> bool:
    """A wrong "0.3" is not found inside a worked "0.325"; "3/2" in the
    working reaches an option written \\(\\frac{3}{2}\\)."""
    wanted = plain(answer)
    if not wanted:
        return False
    if re.search(rf"(?<![\w.]){re.escape(wanted)}(?![\w]|\.\d)", plain(working)):
        return True
    marked = number(answer)
    if marked is None:
        return False
    found = (number(token) for token in _NUMBERS_IN.findall(plain(working)))
    return any(
        value and abs(value[0] - marked[0]) <= 1e-9 * max(1.0, abs(marked[0]))
        for value in found
    )


def _expected(check: str) -> float | str:
    """What check works out to, or why it cannot be read. Every side of a
    chain such as 9/10 * 5/3 = 45/30 = 3/2 must agree."""
    values = []
    for side in check.split("="):
        try:
            written = side.strip().replace("÷", "/").replace("×", "*")
            values.append(float(evaluate(written)))
        except CalculationError as error:
            return f"check could not be worked out ({error}); give plain arithmetic, e.g. 7/12."
    if any(
        abs(value - values[0]) > 1e-9 * max(1.0, abs(values[0])) for value in values
    ):
        return f"The sides of check, {check!r}, are not equal; the arithmetic is wrong somewhere."
    return values[-1]


def _key_problem(marked: str, working: str, check: str) -> str | None:
    if check.strip():
        expected = _expected(check)
        if isinstance(expected, str):
            return expected
        as_number = number(marked)
        if as_number is None:
            return f"The option marked right, {marked!r}, is not a number, so check cannot confirm it."
        if not agrees(expected, as_number):
            return f"check gives {expected:g}, but the option marked right is {marked!r}. Correct the options and the key."
    if not _reaches(working, marked):
        return f"The working does not reach {marked!r}, the option marked right. Work it out again and mark the option it reaches."
    return None


def _checked(written: PracticeQuestion) -> Question | str:
    """The question as the card shows it, or why it cannot be."""
    choices = [clean(option) for option in written.options if clean(option)]
    problem = options_problem(
        clean(written.question), choices, written.answer_index
    ) or _key_problem(choices[written.answer_index], written.working, written.check)
    if problem:
        return problem
    return shown(written, choices)


def give_practice(
    instruction: str, questions: list[PracticeQuestion]
) -> dict | Outcome:
    """Give the learner practice as a card of multiple-choice questions they answer
    by tapping. Use it whenever they ask to practise, to be tested, or for questions
    to try: as many questions as they ask for, one when they do not say, up to five,
    in one call. Work each answer out before writing its options. Write mathematics
    in LaTeX between \\( and \\).

    Args:
        instruction: One line telling the learner what to do, e.g. "Add the
            fractions. Give each answer in its simplest form."
        questions: The questions, in the order the learner answers them.
    """
    problem = count_problem(questions)
    if problem:
        return {"error": problem}
    checked = [_checked(written) for written in questions]
    if any(isinstance(result, str) for result in checked):
        return refused(checked, "give_practice")
    shown = [result for result in checked if isinstance(result, Question)]
    content = PracticeSet(instruction=clean(instruction), questions=shown)
    return Outcome(
        told={
            "done": CARD_TOLD.format(
                what="these questions", never="the questions, their options or answers"
            )
        },
        card=PracticeCard(
            tool_input={
                "instruction": instruction,
                "questions": [written.model_dump() for written in questions],
            },
            tool_result=PracticeResult(
                content=[TextContent(text=content.describe())],
                structured_content=content,
                meta=ResultMeta(view_uuid=uuid.uuid4().hex),
            ),
        ),
    )
