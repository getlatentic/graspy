"""A number rounded to a place: "Round ₦184 to the nearest ten", "3.14159 to 2
decimal places", or each of several prices rounded and added ("round each
price to the nearest ten naira and add them"). Halves round up, as school
teaches. Raises NotComputable for anything else."""

from __future__ import annotations

import math
import re
from fractions import Fraction

from .asked import Asked, Worked
from .expression import NotComputable
from .tokens import numbers_in
from .wanted import Wanted

_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
_PLACE_VALUES = {
    "ten": Fraction(10), "hundred": Fraction(100), "thousand": Fraction(1000),
    "million": Fraction(10**6), "tenth": Fraction(1, 10),
    "hundredth": Fraction(1, 100), "thousandth": Fraction(1, 1000),
    "whole": Fraction(1), "unit": Fraction(1),
}  # fmt: skip
_NEAREST = re.compile(
    r"nearest\s+(?:₦\s*)?(?P<place>\d+|ten|hundred|thousand|million|tenth|hundredth|thousandth|whole|unit)\b",
    re.IGNORECASE,
)
_DECIMAL_PLACES = re.compile(
    r"\b(?P<n>\d+|one|two|three|four)\s+(?:decimal\s+places?|d\.?p\b\.?)", re.IGNORECASE
)
_SIGNIFICANT = re.compile(
    r"\b(?P<n>\d+|one|two|three|four)\s+(?:significant\s+(?:figures?|digits?)|s\.?f\b\.?)",
    re.IGNORECASE,
)
# "which number rounds to 200" works backwards; a list item "1." is not a number.
_BACKWARDS = re.compile(
    r"\brounds?\s+(?:up\s+|down\s+)?to\b|\bround(?:ed)?\s+to\s+\d", re.IGNORECASE
)
_LIST_ITEM = re.compile(r"(?m)^\s*\d+[.)]\s")
_EACH = re.compile(
    r"\bround(?:ed|ing)?\s+each\b|\beach\s+\w+\s+(?:is\s+|are\s+)?rounded\b",
    re.IGNORECASE,
)
# "3 notebooks at ₦1 250", "₦128 per kilogram": prices times quantities, not a
# list of amounts to add.
_QUANTITIES = re.compile(
    r"\d\s+[a-z]+(?:\s+of\s+[a-z]+)?\s+at\s+(?:₦|N)?\s*\d|\bper\b|×|\btimes\b",
    re.IGNORECASE,
)
_ADDED = re.compile(r"\b(?:total|sum|add(?:ed|ing)?|altogether)\b", re.IGNORECASE)
MOST_NUMBERS = 8


def _count(said: str) -> int:
    return _WORDS[said.lower()] if said.lower() in _WORDS else int(said)


def _half_up(value: Fraction, step: Fraction) -> Fraction:
    return math.floor(value / step + Fraction(1, 2)) * step


def _step(spec: re.Match, kind: str, value: Fraction) -> Fraction:
    """The size of one step to round to."""
    if kind == "nearest":
        place = spec["place"].lower()
        return _PLACE_VALUES[place] if place in _PLACE_VALUES else Fraction(int(place))
    places = _count(spec["n"])
    if kind == "decimal":
        return Fraction(1, 10**places)
    if value == 0 or places == 0:
        raise NotComputable("significant figures of zero")
    return Fraction(10) ** (math.floor(math.log10(abs(value))) - places + 1)


def _specs(text: str) -> list[tuple[str, re.Match]]:
    found = [
        (kind, match)
        for kind, pattern in (
            ("nearest", _NEAREST),
            ("decimal", _DECIMAL_PLACES),
            ("significant", _SIGNIFICANT),
        )
        for match in pattern.finditer(text)
    ]
    return sorted(found, key=lambda pair: pair[1].start())


def _without(text: str, specs: list[tuple[str, re.Match]]) -> str:
    for _, match in reversed(specs):
        text = text[: match.start()] + " " + text[match.end() :]
    return text


def rounded(text: str) -> Asked:
    specs = _specs(text)
    if not specs or _BACKWARDS.search(text) or _LIST_ITEM.search(text):
        raise NotComputable("not a number to round")
    values = [number.value for number in numbers_in(_without(text, specs))]
    if not values or len(values) > MOST_NUMBERS or min(values) < 0:
        raise NotComputable(
            "no numbers, too many, or a negative one, which has no one rounding"
        )
    if len(values) == 1 and len(specs) == 1:
        kind, spec = specs[0]
        return _asked(_half_up(values[0], _step(spec, kind, values[0])))
    if not _ADDED.search(text) or len(specs) > 2 or _QUANTITIES.search(text):
        raise NotComputable("several numbers without adding them")
    each = _sum_of_rounded(values, specs)
    if _EACH.search(text):
        return _asked(each)
    # "the estimated total, to the nearest ten" rounds each or the total.
    whole = _half_up(sum(values, Fraction(0)), _step(specs[0][1], specs[0][0], 1))
    if len(specs) > 1 or whole != each:
        raise NotComputable("a total that may be rounded before or after adding")
    return _asked(each)


def _sum_of_rounded(values: list[Fraction], specs: list) -> Fraction:
    total = sum(
        (_half_up(v, _step(specs[0][1], specs[0][0], v)) for v in values), Fraction(0)
    )
    if len(specs) == 2:
        total = _half_up(total, _step(specs[1][1], specs[1][0], total))
    return total


def _asked(value: Fraction) -> Asked:
    return Asked(value, Wanted(), Worked.ROUNDING)
