"""The mean, median, mode or range of a list of numbers written in the
question: "What is the median of the data set 5, 11, 9, 9, 10?". A list with
no single mode has no mode to ask for. Raises NotComputable for anything
else."""

from __future__ import annotations

import re
from collections import Counter
from fractions import Fraction

from .asked import Asked, Worked
from .expression import NotComputable
from .tokens import numbers_in
from .wanted import Wanted

_NUMBER = r"-?\d+(?:\.\d+)?"
_QUESTION = re.compile(
    rf"""^\s*(?:what\s+is|find|calculate|work\s+out|determine)\s+the\s+
        (?P<name>arithmetic\s+mean|mean|average|median|mode|range)\s+(?:of|for)\s+
        (?:[a-z\-‑]+\s+){{0,5}}:?\s*\(?\s*
        (?P<list>{_NUMBER}(?:\s*(?:,|;|and)\s*{_NUMBER})+)\s*\)?\s*[?.]?\s*$""",
    re.IGNORECASE | re.VERBOSE,
)
_THOUSANDS = re.compile(r"\d,\d")  # 1,200 is one number here, not two
MOST_VALUES = 50


def _median(values: list[Fraction]) -> Fraction:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def _mode(values: list[Fraction]) -> Fraction:
    counted = Counter(values).most_common()
    if counted[0][1] == 1 or (len(counted) > 1 and counted[1][1] == counted[0][1]):
        raise NotComputable("no single mode")
    return counted[0][0]


_MEASURES = {
    "mean": lambda values: sum(values, Fraction(0)) / len(values),
    "median": _median,
    "mode": _mode,
    "range": lambda values: max(values) - min(values),
}


def statistic(text: str) -> Asked:
    found = _QUESTION.match(text)
    if found is None or _THOUSANDS.search(text):
        raise NotComputable("not a statistic of a list")
    values = [number.value for number in numbers_in(found["list"])]
    if not 2 <= len(values) <= MOST_VALUES:
        raise NotComputable("too few or too many values")
    name = found["name"].lower().split()[-1]
    measure = _MEASURES["mean" if name == "average" else name]
    return Asked(measure(values), Wanted(), Worked.STATISTIC)
