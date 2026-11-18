"""Questions whose marked option makes a claim about numbers in the question
that code can test, or that ask for what the data cannot give:

- an option saying the data has an outlier, or has none, against the
  1.5 × IQR rule (both usual ways of taking the quartiles must agree);
- the median of a frequency table whose rows are names, not numbers."""

from __future__ import annotations

import re
from fractions import Fraction

from .tokens import numbers_in

_PARENTHESISED = re.compile(r"\(([\d.,\s-]+)\)")
_NONE = re.compile(
    r"\bno\s+(?:extreme\s+|obvious\s+|clear\s+)?outliers?\b"
    r"|\bnot\s+an?\s+(?:extreme\s+)?outlier\b|\bwithout\s+(?:any\s+)?outliers?\b"
    r"|\boutliers?\s+(?:is|are)\s+not\b|\bdoes\s+not\s+contain\b[^.;]{0,25}\boutlier",
    re.IGNORECASE,
)
_SOME = re.compile(r"\boutliers?\b", re.IGNORECASE)
FEWEST_VALUES = 5
MOST_VALUES = 40
_FENCE = Fraction(3, 2)
# "No outlier" is refused only when a value is beyond this, which no one calls mild.
_FAR_FENCE = Fraction(3)


def _median(ordered: list[Fraction]) -> Fraction:
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def _quartiles(ordered: list[Fraction], keep_middle: bool) -> tuple[Fraction, Fraction]:
    half = len(ordered) // 2
    lower = ordered[: half + 1] if keep_middle and len(ordered) % 2 else ordered[:half]
    upper = (
        ordered[-half - 1 :] if keep_middle and len(ordered) % 2 else ordered[-half:]
    )
    return _median(lower), _median(upper)


def _outliers(
    values: list[Fraction], keep_middle: bool, fence: Fraction = _FENCE
) -> list[Fraction]:
    ordered = sorted(values)
    low, high = _quartiles(ordered, keep_middle)
    reach = fence * (high - low)
    return [v for v in ordered if v < low - reach or v > high + reach]


def outliers_in(
    values: list[Fraction], fence: Fraction = _FENCE
) -> list[Fraction] | None:
    """The outliers beyond ``fence`` × IQR; None when the two ways of taking
    the quartiles disagree."""
    exclusive = _outliers(values, False, fence)
    inclusive = _outliers(values, True, fence)
    return exclusive if exclusive == inclusive else None


def _data(question: str) -> list[Fraction] | None:
    lists = _PARENTHESISED.findall(question)
    if len(lists) != 1:
        return None
    values = [number.value for number in numbers_in(lists[0])]
    return values if FEWEST_VALUES <= len(values) <= MOST_VALUES else None


def _says_none(option: str) -> bool | None:
    """Whether the option says the data has no outlier, or (None) says nothing
    about outliers."""
    if not _SOME.search(option):
        return None
    return _NONE.search(option) is not None


def outlier_claim(question: str, options: list[str], marked: int) -> str | None:
    values = _data(question)
    says_none = _says_none(options[marked])
    if values is None or says_none is None:
        return None
    found = outliers_in(values, _FAR_FENCE if says_none else _FENCE)
    if found is None or bool(found) != says_none:
        return None
    if found:
        return f"the data has an outlier ({found[0]}) far beyond the rest (3 × IQR), but the option marked right says it has none"
    return "the data has no outlier by the 1.5 × IQR rule, but the option marked right says it has one"


_ROW = re.compile(r"^\s*\|(.+)\|\s*$", re.MULTILINE)
_FREQUENCY = re.compile(
    r"\b(?:number\s+of|frequency|count|tally|votes)\b", re.IGNORECASE
)
_RULE = re.compile(r"^[\s|:-]+$")
_SPLIT = re.compile(r"\s*(?:,|;|\band\b|[–-])\s*")


def _rows(question: str) -> list[list[str]]:
    rows = [
        [cell.strip() for cell in row.split("|")]
        for row in _ROW.findall(question)
        if not _RULE.match(row)
    ]
    return rows


def median_of_names(question: str, options: list[str], marked: int) -> str | None:
    """The marked option gives a row name as a median."""
    rows = _rows(question)
    if len(rows) < 3 or not _FREQUENCY.search(" ".join(rows[0])):
        return None
    names = {row[0].casefold() for row in rows[1:] if row[0]}
    if any(re.fullmatch(r"[\d.,\s-]+", name) for name in names):
        return None
    if not re.search(r"\bmedian\b", question, re.IGNORECASE) or re.search(
        r"\b(?:can't|cannot|why|not)\b", question, re.IGNORECASE
    ):
        return None
    given = {part.casefold() for part in _SPLIT.split(options[marked])}
    if given & names:
        return "a median is asked of rows that are names, which have no middle value"
    return None
