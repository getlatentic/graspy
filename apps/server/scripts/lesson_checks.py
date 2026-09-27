"""What a lesson's questions and parts must be, checked in code: whether the
option marked right is right, where the answer can be worked out from the
question, and whether each question and the lesson are whole.

A question is worked out only when it is plainly one of: arithmetic ("What
is \\(\\frac{1}{2} + \\frac{1}{4}\\)?"), one linear equation in one letter
("Solve 2x + 3 = 11"), or a unit conversion ("Convert 2.5 m to cm"). A word
problem, or a question comparing values, is left alone rather than guessed."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.agent.choices import agrees, number, plain
from app.agent.sandbox import CalculationError, evaluate

Verdict = Literal["not computable", "right", "wrong", "unmatched"]

# Asking for one value; comparing values is not arithmetic to work out.
_ASKS_VALUE = re.compile(
    r"\b(what is|what's|calculate|find|work out|evaluate|simplify|solve|"
    r"convert|how many|how much|equals?|value of)\b|=",
    re.IGNORECASE,
)
_COMPARES = re.compile(
    r"\b(bigger|biggest|smaller|smallest|greater|greatest|larger|largest|"
    r"less|least|more|most|compare|order|which|true|false|estimate|about|"
    r"round|nearest)\b",
    re.IGNORECASE,
)
_LATEX = (
    # A kept lesson's maths is tagged, as repair_markdown leaves it.
    (re.compile(r"</?latex-(?:inline|block)>"), " "),
    (re.compile(r"\\displaystyle"), " "),
    (re.compile(r"\\text\{([^{}]*)\}"), r" \1 "),
    (re.compile(r"\\d?frac\{([^{}]+)\}\{([^{}]+)\}"), r"((\1)/(\2))"),
    (re.compile(r"\\(times|cdot)|×"), "*"),
    (re.compile(r"\\div|÷"), "/"),
    (re.compile(r"−|–"), "-"),
    (re.compile(r"\\[()\[\]]|\$|\\left|\\right|\\,|\\;|\\!"), " "),
    (re.compile(r"(?<=\d),(?=\d{3}\b)"), ""),
    # A fraction of two whole numbers reads as one number: "(7/12)".
    (re.compile(r"\(\((\d+)\)/\((\d+)\)\)"), r"(\1/\2)"),
)
_NUMBER = re.compile(r"\d+(?:\.\d+)?")
# A list marker the learner sees, as "- 0.875" shows it.
_SHOWN_MARKER = re.compile(r"^\s*(?:[-*•]|[A-Da-d][).])\s+")
_ARITHMETIC = re.compile(r"[\d(][\d\s.+\-*/()]*[\d)]")
_OPERATOR_BETWEEN = re.compile(r"[\d)]\s*[+\-*/]\s*[\d(]")
_EQUATION = re.compile(
    r"((?:\d+(?:\.\d+)?|(?<![a-z])[a-z](?![a-z])|[\s()+\-*/])+)="
    r"((?:\d+(?:\.\d+)?|(?<![a-z])[a-z](?![a-z])|[\s()+\-*/])+)"
)
_UNITS: dict[str, tuple[str, float]] = {
    "mm": ("length", 0.001),
    "millimetre": ("length", 0.001),
    "cm": ("length", 0.01),
    "centimetre": ("length", 0.01),
    "m": ("length", 1.0),
    "metre": ("length", 1.0),
    "km": ("length", 1000.0),
    "kilometre": ("length", 1000.0),
    "mg": ("mass", 0.001),
    "milligram": ("mass", 0.001),
    "g": ("mass", 1.0),
    "gram": ("mass", 1.0),
    "kg": ("mass", 1000.0),
    "kilogram": ("mass", 1000.0),
    "ml": ("volume", 0.001),
    "millilitre": ("volume", 0.001),
    "l": ("volume", 1.0),
    "litre": ("volume", 1.0),
    "second": ("time", 1.0),
    "minute": ("time", 60.0),
    "hour": ("time", 3600.0),
}
_UNIT_WORD = r"(mm|cm|km|kg|mg|ml|m|g|l|(?:milli|centi|kilo)?(?:metre|meter|gram|litre|liter)s?|seconds?|minutes?|hours?)"
_QUANTITY = re.compile(rf"(\d+(?:\.\d+)?)\s*{_UNIT_WORD}\b", re.IGNORECASE)
_UNIT_ALONE = re.compile(rf"\b{_UNIT_WORD}\b", re.IGNORECASE)


def _unit(word: str) -> tuple[str, float] | None:
    key = word.lower().replace("meter", "metre").replace("liter", "litre")
    return _UNITS.get(key) or _UNITS.get(key.removesuffix("s"))


def _normalised(text: str) -> str:
    for pattern, replacement in _LATEX:
        text = pattern.sub(replacement, text)
    return text


def _arithmetic(question: str) -> float | None:
    spans = {
        span.strip()
        for span in _ARITHMETIC.findall(question)
        if _OPERATOR_BETWEEN.search(span)
    }
    if len(spans) != 1:
        return None
    span = spans.pop()
    # "The sum of 3/4 and 0.25" is a word problem around 3/4, not 3/4.
    if len(_NUMBER.findall(span)) != len(_NUMBER.findall(question)):
        return None
    try:
        return float(evaluate(span))
    except CalculationError, SyntaxError, ZeroDivisionError, TypeError:
        return None


def _with_products(side: str, letter: str) -> str:
    side = re.sub(rf"(\d|\))\s*(?=[{letter}(])", r"\1*", side)
    return re.sub(rf"({letter}|\))\s*(?=[\d(])", r"\1*", side)


def _linear(question: str) -> float | None:
    """The one solution of an equation linear in its one letter."""
    found = _EQUATION.search(question.lower())
    if not found:
        return None
    left, right = found.groups()
    letters = set(re.findall(r"(?<![a-z])[a-z](?![a-z])", left + right))
    if len(letters) != 1:
        return None
    letter = letters.pop()
    expression = f"({_with_products(left, letter)})-({_with_products(right, letter)})"
    try:
        at = [float(evaluate(expression.replace(letter, f"({x})"))) for x in (0, 1, 2)]
    except CalculationError, SyntaxError, ZeroDivisionError, TypeError:
        return None
    slope = at[1] - at[0]
    if slope == 0 or abs(at[2] - at[1] - slope) > 1e-9:
        return None
    return -at[0] / slope


def _conversion(question: str) -> float | None:
    quantities = _QUANTITY.findall(question)
    if len(quantities) != 1:
        return None
    amount, unit_word = quantities[0]
    source = _unit(unit_word)
    rest = _QUANTITY.sub(" ", question)
    targets = {
        _unit(word)
        for word in _UNIT_ALONE.findall(rest)
        if _unit(word) and _unit(word)[0] == (source or ("", 0))[0]
    }
    targets.discard(source)
    if not source or len(targets) != 1:
        return None
    return float(amount) * source[1] / targets.pop()[1]


def computed(question: str) -> float | None:
    """The answer, when the question is plainly one to work out."""
    text = _normalised(question)
    if not _ASKS_VALUE.search(text) or _COMPARES.search(text):
        return None
    for solve in (_linear, _conversion, _arithmetic):
        value = solve(text)
        if value is not None:
            return value
    return None


Value = tuple[float, int | None]


def option_value(option: str) -> Value | None:
    """ "x = 4", "250 cm", "₦250" and "\\(\\frac{3}{4}\\)" as numbers, with
    the decimal places each gives."""
    text = _SHOWN_MARKER.sub("", _normalised(option)).strip()
    text = re.sub(r"^[a-z]\s*=\s*", "", text)
    text = re.sub(r"\s*[a-zA-Z][a-zA-Z\s.]*$", "", text).strip()
    text = re.sub(r"^\((\d+/\d+)\)$", r"\1", text)
    return number(text)


def _same(answer: float, value: Value | None) -> bool:
    """As far as the option is written: 0.42 is 5/12 to two places."""
    return value is not None and agrees(answer, value)


def _equal(a: Value | None, b: Value | None) -> bool:
    return a is not None and b is not None and abs(a[0] - b[0]) < 1e-9


def _words(text: str) -> set[str]:
    """Its longer words and its numbers: an option such as "5/8 = 0.625 and
    0.6 = 3/5" has no long words at all."""
    return set(re.findall(r"[a-z]{4,}|\d+(?:\.\d+)?(?:/\d+)?", text.lower()))


@dataclass(frozen=True)
class Question:
    where: str
    question: str
    options: list[str]
    answer_index: int
    correct_feedback: str

    def verdict(self) -> Verdict:
        answer = computed(self.question)
        if answer is None:
            return "not computable"
        values = [option_value(option) for option in self.options]
        if self.in_range() and _same(answer, values[self.answer_index]):
            return "right"
        if any(_same(answer, value) for value in values):
            return "wrong"
        return "unmatched"

    def in_range(self) -> bool:
        return 0 <= self.answer_index < len(self.options)

    def problems(self) -> list[str]:
        found = []
        if len(self.options) != 4:
            found.append(f"{len(self.options)} options, not four")
        if any(not plain(option) for option in self.options):
            found.append("an empty option")
        if any(_SHOWN_MARKER.match(option) for option in self.options):
            found.append("an option shown with a list marker")
        if self._duplicated():
            found.append("the same answer twice")
        if not self.in_range():
            found.append("no option marked right")
        elif not self.feedback_names_answer():
            found.append("feedback does not name the answer")
        return found

    def _duplicated(self) -> bool:
        seen: list[tuple[str, Value | None]] = []
        for option in self.options:
            text = plain(_SHOWN_MARKER.sub("", _normalised(option)))
            value = option_value(option)
            if any(text == other or _equal(value, v) for other, v in seen):
                return True
            seen.append((text, value))
        return False

    def feedback_names_answer(self) -> bool:
        """By its number, its words, or half its longer words: feedback on a
        sentence-long option says it again in its own words."""
        marked = _SHOWN_MARKER.sub("", _normalised(self.options[self.answer_index]))
        feedback = _normalised(self.correct_feedback)
        value = option_value(marked)
        if value is not None:
            found = re.findall(r"\d+(?:\.\d+)?(?:\s*/\s*\d+)?", feedback)
            return any(_equal(option_value(token), value) for token in found)
        if plain(marked) in plain(feedback):
            return True
        wanted = _words(marked)
        return bool(wanted) and len(wanted & _words(feedback)) >= len(wanted) / 2


def questions(lesson: dict) -> list[Question]:
    """Every slide's check and the practice question, from the lesson as the
    app receives it."""
    found = [
        Question(
            f"slide {number}",
            slide["assessment"]["prompt"],
            slide["assessment"]["options"],
            slide["assessment"]["answerIndex"],
            slide["assessment"].get("correctFeedback", ""),
        )
        for number, slide in enumerate(lesson["slides"], 1)
    ]
    practice = lesson.get("practice")
    if practice:
        found.append(
            Question(
                "practice",
                practice["question"],
                practice["options"],
                practice["answerIndex"],
                practice["correctFeedback"],
            )
        )
    return found


def missing_parts(lesson: dict) -> list[str]:
    slides = lesson["slides"]
    missing = []
    if not lesson.get("objectives"):
        missing.append("objectives")
    if not any(
        slide["slideType"] == "worked_example" or "example" in slide["bodyMd"].lower()
        for slide in slides
    ):
        missing.append("a worked example")
    if not slides or any(
        not slide["assessment"]["prompt"].strip()
        or len(slide["assessment"]["options"]) < 2
        for slide in slides
    ):
        missing.append("a check on every slide")
    if not lesson.get("practice"):
        missing.append("a practice question")
    return missing
