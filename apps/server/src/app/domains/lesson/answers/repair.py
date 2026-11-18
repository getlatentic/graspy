"""A check repaired from its verdict, where code can repair it: the key moved
to the one right option, or the extra right options taken out. A check with
no right option cannot be repaired here; it is written again."""

from __future__ import annotations

from dataclasses import dataclass, replace
from decimal import Decimal, localcontext
from fractions import Fraction

from .asked import Asked
from .feedback import names
from .verdict import Found, Verdict, terminates

# A check keeps at least this many options when code takes the extra right
# ones out; fewer is a guess, and it is written again instead.
FEWEST_OPTIONS = 3
FEWEST_ALLOWED = 2


@dataclass(frozen=True)
class Check:
    question: str
    options: list[str]
    answer_index: int
    correct_feedback: str
    incorrect_feedback: str


def _feedback(check: Check, was: str, now: str) -> Check:
    """Feedback that names the option wrongly marked right now names the
    right one: it may call the wrong answer right, even beside the right one
    ("250 cm is 2.5 m, so the answer is 0.25 m")."""

    def mended(feedback: str, told: str) -> str:
        return told if names(feedback, was) else feedback

    return replace(
        check,
        correct_feedback=mended(
            check.correct_feedback, f"That's right: the answer is {now}."
        ),
        incorrect_feedback=mended(
            check.incorrect_feedback, f"Not quite: the answer is {now}."
        ),
    )


def rekeyed(check: Check, index: int) -> Check:
    if index == check.answer_index:
        return check
    moved = replace(check, answer_index=index)
    return _feedback(moved, check.options[check.answer_index], check.options[index])


def trimmed(check: Check, right: tuple[int, ...], fewest: int) -> Check | None:
    """One right option kept, the one marked when it is right, and the others
    taken out; None when too few options would be left."""
    kept = check.answer_index if check.answer_index in right else right[0]
    left = [at for at in range(len(check.options)) if at == kept or at not in right]
    if len(left) < fewest:
        return None
    moved = rekeyed(check, kept)
    return replace(
        moved,
        options=[check.options[at] for at in left],
        answer_index=left.index(kept),
    )


def repaired(
    check: Check, verdict: Verdict, fewest: int = FEWEST_OPTIONS
) -> Check | None:
    """The check as a learner may see it, or None when it must be written
    again."""
    match verdict.found:
        case Found.WRONG_KEY:
            return rekeyed(check, verdict.right[0])
        case Found.DOUBLE_RIGHT:
            return trimmed(check, verdict.right, fewest)
        case Found.NO_RIGHT_OPTION | Found.CONTRADICTED:
            return None
    return check


def _shown(value: Fraction) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    shown = f"{value.numerator}/{value.denominator}"
    if not terminates(value):
        return shown
    with localcontext() as exact:
        exact.prec = 60
        decimal = Decimal(value.numerator) / Decimal(value.denominator)
        return f"{shown} ({decimal.normalize():f})"


def _answer(asked: Asked) -> str:
    unit = f" {asked.unit.name}" if asked.unit else ""
    form = asked.wanted.describe()
    return f"{_shown(asked.value)}{unit}" + (f", written {form}" if form else "")


def problem(check: Check, verdict: Verdict) -> str:
    """What was wrong, for the model writing the check again."""
    asked = f"The check {check.question!r}"
    if verdict.found is Found.CONTRADICTED:
        return (
            f"{asked} contradicts itself: {verdict.reason}. Work the answer "
            "out first, write the options with exactly one right, and write "
            "feedback that agrees with answer_index, with no correction or "
            "second thought inside it."
        )
    answer = _answer(verdict.asked)
    if verdict.found is Found.DOUBLE_RIGHT:
        both = ", ".join(repr(check.options[at]) for at in verdict.right)
        return (
            f"{asked} has more than one right option: {both} are each {answer}. "
            "Write the check again with exactly one right option, and "
            "answer_index marking it."
        )
    return (
        f"{asked} has the answer {answer}, but none of its options "
        f"({', '.join(map(repr, check.options))}) is. Write the check again "
        "with the right answer among the options, and answer_index marking it."
    )
