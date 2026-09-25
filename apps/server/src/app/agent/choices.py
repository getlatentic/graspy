"""What every multiple-choice question must be before it is shown: a
question, two to five different options, and a key naming one of them."""

from __future__ import annotations

import re
from typing import Protocol

from .cards import Question

MIN_OPTIONS = 2
MAX_OPTIONS = 5
MAX_TEXT = 600
MIN_QUESTIONS = 1
MAX_QUESTIONS = 5
RECURRING_PLACES = 8


def clean(text: str, limit: int = MAX_TEXT) -> str:
    return " ".join(str(text).split())[:limit]


def plain(text: str) -> str:
    """Without LaTeX delimiters, dollar signs, extra spaces or case, so
    "\\(0.875\\)" and "0.875" are the same answer."""
    return " ".join(re.sub(r"\\[()\[\]]|\$", " ", text).lower().split())


_FRACTION = re.compile(r"^(-?)(?:(\d+)\s+)?(\d+)/(\d+)$")
_DECIMAL = re.compile(r"^-?\d+(?:\.\d+)?$")


def _written(text: str) -> str:
    """LaTeX fractions as a/b, recurring digits written out, currency and
    thousands separators gone."""
    written = re.sub(
        r"\\(?:overline|dot)\{(\d+)\}",
        lambda m: m.group(1) * RECURRING_PLACES,
        plain(text),
    )
    written = re.sub(
        r"(\d*)\s*\\d?frac\{(\d+)\}\{(\d+)\}",
        lambda m: f"{m.group(1)} {m.group(2)}/{m.group(3)}".strip(),
        written,
    )
    written = re.sub(r"[₦$£€,]|naira|kobo", "", written)
    return " ".join(written.split())


def number(text: str) -> tuple[float, int | None] | None:
    """A decimal, fraction or mixed number, with the decimal places it gives
    (None for an exact fraction); None when it is not a plain number."""
    written = _written(text)
    if _DECIMAL.match(written.replace(" ", "")):
        compact = written.replace(" ", "")
        places = len(compact.split(".")[1]) if "." in compact else 0
        return float(compact), places
    fraction = _FRACTION.match(written)
    if not fraction or int(fraction.group(4)) == 0:
        return None
    sign, whole, top, bottom = fraction.groups()
    value = int(whole or 0) + int(top) / int(bottom)
    return (-value if sign else value), None


def agrees(expected: float, marked: tuple[float, int | None]) -> bool:
    """As far as it is written: 0.5833 for 7/12 is right to four places; a
    fraction must be exact."""
    value, places = marked
    if places is None:
        return abs(value - expected) <= 1e-9 * max(1.0, abs(expected))
    return abs(value - expected) <= 0.5 * 10**-places + 1e-9


def _same_answer(a: tuple[float, int | None], b: tuple[float, int | None]) -> bool:
    """Exactly: 0.3 beside 1/3 is a common mistake to offer."""
    return abs(a[0] - b[0]) <= 1e-9 * max(1.0, abs(a[0]))


def options_problem(question: str, choices: list[str], answer_index: int) -> str | None:
    """Why a question's options cannot be shown, in words the model can act on."""
    if not question:
        return "The question is empty."
    if not MIN_OPTIONS <= len(choices) <= MAX_OPTIONS:
        return f"Give between {MIN_OPTIONS} and {MAX_OPTIONS} options; there were {len(choices)}."
    if not isinstance(answer_index, int) or not 0 <= answer_index < len(choices):
        return f"answer_index must be the right option's position, from 0 to {len(choices) - 1}."
    for first in range(len(choices)):
        for second in range(first + 1, len(choices)):
            a, b = choices[first], choices[second]
            as_numbers = number(a), number(b)
            if plain(a) == plain(b) or (all(as_numbers) and _same_answer(*as_numbers)):
                return (
                    f"Options {a!r} and {b!r} are the same answer; replace one "
                    "with a different answer, such as a common mistake."
                )
    return None


class Written(Protocol):
    question: str
    answer_index: int
    correct_feedback: str
    incorrect_feedback: str
    hint: str


def shown(written: Written, choices: list[str]) -> Question:
    return Question(
        question=clean(written.question),
        options=choices,
        answer_index=written.answer_index,
        correct_feedback=clean(written.correct_feedback),
        incorrect_feedback=clean(written.incorrect_feedback),
        hint=clean(written.hint),
    )


def count_problem(questions: list) -> str | None:
    if not MIN_QUESTIONS <= len(questions) <= MAX_QUESTIONS:
        return f"Give between {MIN_QUESTIONS} and {MAX_QUESTIONS} questions; there were {len(questions)}."
    return None


def refused(checked: list, tool: str) -> dict:
    """Every question that cannot be shown, at once: refused one at a time,
    a set of five runs out of tool steps, and the model then writes the
    questions and their answers into its reply."""
    problems = [
        f"Question {position}: {result}"
        for position, result in enumerate(checked, 1)
        if isinstance(result, str)
    ]
    return {
        "error": " ".join(problems),
        "then": f"Fix these and call {tool} again with every question. Never "
        "write the questions or their options in your answer.",
    }


# Without it, asked for three questions, the model writes "Here is the
# first… second… third question" around a single card.
CARD_TOLD = (
    "The app shows the learner {what} as a card below your answer, and marks "
    "each choice as they tap it. Introduce it in one short sentence. Never "
    "write {never} in your answer: the learner would read them twice."
)
