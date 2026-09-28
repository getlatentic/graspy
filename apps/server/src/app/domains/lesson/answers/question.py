"""The exact answer to a question, when the question is plainly one to work
out; None for anything else, which a check leaves alone: a check refused
wrongly is worse than one not checked.

Worked out: arithmetic on whole numbers, decimals, fractions and
percentages ("What is 20% of ₦50?"), a number in another form ("Write 2/5 as
a decimal"), a unit conversion ("Convert 2.5 m to cm") and one linear
equation in one letter ("Solve 3x - 5 = 10")."""

from __future__ import annotations

from .asked import Asked
from .calculation import calculation
from .equation import equation, is_equation
from .expression import NotComputable
from .maths_text import plain_maths
from .spans import letters_as_units, split
from .tokens import tokens
from .wanted import Unreadable

MAX_QUESTION = 400


def asked(question: str) -> Asked | None:
    if len(question) > MAX_QUESTION:
        return None
    read = tokens(plain_maths(question))
    if read is None:
        return None
    try:
        if any(is_equation(span) for span in split(read).spans):
            return equation(split(read))
        return calculation(split(letters_as_units(read)))
    except NotComputable, Unreadable:
        return None
