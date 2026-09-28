"""What a check's options are against the answer worked out from its
question. Only a question whose every option reads as a number is judged:
with one that does not, "none of these" may be the answer."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from fractions import Fraction

from .asked import Asked
from .question import asked
from .tokens import Form
from .units import Unit
from .wanted import Wanted
from .written import Written, written


class Found(StrEnum):
    NOT_COMPUTABLE = "not computable"
    RIGHT = "right"
    WRONG_KEY = "wrong key"
    DOUBLE_RIGHT = "double right"
    NO_RIGHT_OPTION = "no right option"


@dataclass(frozen=True)
class Verdict:
    found: Found
    asked: Asked | None = None
    # The options that answer the question, in the form it asks for.
    right: tuple[int, ...] = ()


NOT_COMPUTABLE = Verdict(Found.NOT_COMPUTABLE)

_FORMS_FOR: dict[Form, frozenset[Form]] = {
    Form.DECIMAL: frozenset({Form.DECIMAL, Form.WHOLE}),
    Form.FRACTION: frozenset({Form.FRACTION, Form.MIXED}),
    Form.MIXED: frozenset({Form.MIXED, Form.WHOLE}),
    Form.PERCENT: frozenset({Form.PERCENT}),
    Form.WHOLE: frozenset({Form.WHOLE}),
}
_LOWEST_FORMS = frozenset({Form.FRACTION, Form.MIXED, Form.WHOLE})


def _in_form(option: Written, wanted: Wanted) -> bool:
    if wanted.form and option.form not in _FORMS_FOR[wanted.form]:
        return False
    if wanted.improper and (option.form is not Form.FRACTION or abs(option.value) < 1):
        return False
    return not wanted.lowest or (option.lowest and option.form in _LOWEST_FORMS)


def _fits(option: Written, wanted: Wanted) -> bool:
    in_unit = not (wanted.unit and option.unit and option.unit != wanted.unit)
    return in_unit and _in_form(option, wanted)


def _value(option: Written, unit: Unit | None) -> Fraction | None:
    """In the answer's unit; None in a unit of another kind."""
    if unit is None or option.unit is None:
        return option.value
    if option.unit.kind != unit.kind:
        return None
    return option.unit.to(unit, option.value)


def terminates(value: Fraction) -> bool:
    """Whether it has a decimal that ends: 2/5 does, 1/3 does not."""
    denominator = value.denominator
    for prime in (2, 5):
        while denominator % prime == 0:
            denominator //= prime
    return denominator == 1


def _found(right: list[int], answer_index: int) -> Found:
    if not right:
        return Found.NO_RIGHT_OPTION
    if len(right) > 1:
        return Found.DOUBLE_RIGHT
    return Found.RIGHT if right[0] == answer_index else Found.WRONG_KEY


def _read(options: list[str], answer: Asked | None) -> list[Written] | None:
    """Every option as a number, or None when one is not."""
    if answer is None:
        return None
    read = [written(option, answer.nouns) for option in options]
    return None if any(option is None for option in read) else read


def verdict(question: str, options: list[str], answer_index: int) -> Verdict:
    answer = asked(question)
    read = _read(options, answer)
    if read is None:
        return NOT_COMPUTABLE
    shaped = [at for at, option in enumerate(read) if _fits(option, answer.wanted)]
    equal = [
        at
        for at, option in enumerate(read)
        if _value(option, answer.unit) == answer.value
    ]
    # Options rounded from an answer that never ends, such as 0.33 for 1/3,
    # or a form asked for that no option is written in, mean the question
    # was not read as its writer meant it.
    if not shaped or (not equal and not terminates(answer.value)):
        return NOT_COMPUTABLE
    right = [at for at in equal if at in shaped]
    return Verdict(_found(right, answer_index), answer, tuple(right))
