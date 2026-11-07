"""What every multiple-choice question must be before it is shown: a
question, two to five different options, and a key naming one of them."""

from __future__ import annotations

import re
from typing import Protocol

from .cards import Question
from .refusal import refusal

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


NUMBERS_IN = re.compile(r"\\d?frac\{\d+\}\{\d+\}|\d+\s*/\s*\d+|\d+(?:\.\d+)?|\.\d+")


MIN_WORD = 3
ABOUT_ANSWER = re.compile(r"\b(?:answer|correct|right)\b")


def _numbers(text: str):
    """Each number written in ``text`` as (token, value), a minus sign kept
    and thousands separators dropped."""
    text = re.sub(r"(?<=\d),(?=\d{3}\b)", "", text)
    for found in NUMBERS_IN.finditer(text):
        token, start = found.group(), found.start()
        value = number(token if token[0] != "." else f"0{token}")
        if value is None:
            continue
        negative = (
            start > 0
            and text[start - 1] == "-"
            and (start == 1 or text[start - 2] in " (=:\n")
        )
        yield token, ((-value[0], value[1]) if negative else value)


def states(text: str, right: str, given: str) -> bool:
    """Whether ``text`` states the right option: its words, or a number equal
    to it (a unit after it ignored) that the question had not already given,
    unless the text calls it the answer."""
    wanted, written, setting = plain(right), plain(text), plain(given)
    bare = re.sub(r"\s*[a-z°²³/]+$", "", wanted.replace("%", ""))
    marked = number(bare)
    if marked is None:
        return (
            len(wanted) >= MIN_WORD
            and wanted not in setting
            and re.search(rf"(?<!\w){re.escape(wanted)}(?!\w)", written) is not None
        )
    given_tokens = set(NUMBERS_IN.findall(setting))
    calls_it_the_answer = ABOUT_ANSWER.search(written) is not None
    return any(
        (token not in given_tokens or calls_it_the_answer)
        and _same_answer(value, marked)
        for token, value in _numbers(written)
    )


def key_leak(written: Written, choices: list[str], given: str) -> str | None:
    """Why a hint or a wrong-answer note cannot be shown: the learner reads
    them before they have the answer. ``given`` is what the question already
    puts in front of them."""
    right = choices[written.answer_index]
    for name, text in (
        ("hint", written.hint),
        ("incorrect_feedback", written.incorrect_feedback),
    ):
        if states(text, right, given):
            return (
                f"The {name} gives away the right answer, {right!r}. Write it as "
                "a nudge towards the method, without stating the answer."
            )
    return None


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
    return refusal(
        " ".join(problems)
        + f" Fix these and call {tool} again with every question. Never "
        "write the questions or their options in your answer."
    )


# Without it, asked for three questions, the model writes "Here is the
# first… second… third question" around a single card.
CARD_TOLD = (
    "The app shows the learner {what} as a card below your answer, and marks "
    "each choice as they tap it. Introduce it in one short sentence. Never "
    "write {never} in your answer: the learner would read them twice."
)
