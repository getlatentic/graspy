"""The exact answer to a question, when the question is plainly one to work
out; None for anything else, which a check leaves alone: a check refused
wrongly is worse than one not checked.

Worked out: arithmetic on whole numbers, decimals, fractions and
percentages ("What is 20% of ₦50?"), a number in another form ("Write 2/5 as
a decimal"), a unit conversion ("Convert 2.5 m to cm"), one linear equation
in one letter ("Solve 3x - 5 = 10"), a number rounded to a place, the LCM or
HCF of whole numbers, and the mean, median, mode or range of a listed set."""

from __future__ import annotations

from collections.abc import Callable

from .asked import Asked
from .calculation import calculation
from .divisors import divisor
from .equation import equation, is_equation
from .expression import NotComputable
from .maths_text import plain_maths
from .rounding import rounded
from .spans import letters_as_units, split
from .statistics import statistic
from .tokens import tokens
from .wanted import Unreadable

MAX_QUESTION = 400


def _arithmetic(text: str) -> Asked:
    read = tokens(text)
    if read is None:
        raise NotComputable("not maths")
    if any(is_equation(span) for span in split(read).spans):
        return equation(split(read))
    return calculation(split(letters_as_units(read)))


_FAMILIES: tuple[Callable[[str], Asked], ...] = (
    _arithmetic,
    rounded,
    divisor,
    statistic,
)


def asked(question: str) -> Asked | None:
    text = plain_maths(question)
    if len(text) > MAX_QUESTION:
        return None
    for family in _FAMILIES:
        try:
            return family(text)
        except NotComputable, Unreadable:
            continue
    return None
