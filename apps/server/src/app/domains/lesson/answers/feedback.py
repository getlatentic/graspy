"""What a check's feedback says about its options: which options it names as
numbers, and which it points at by position ("option 3", "the first option",
"index 2"). Feedback that points at an option other than the one marked right
contradicts the key it is shown with."""

from __future__ import annotations

import re

from .maths_text import plain_maths
from .self_correction import self_correction
from .tokens import Form, numbers_in
from .written import written

# 2 and 2.0 are one form; 2/5 and 0.4 are not, so feedback repeating a
# question's "2/5" does not name an option "0.4".
_SAME_FORM = {Form.WHOLE: Form.DECIMAL}
_WORD_AT = {
    "one": 0, "two": 1, "three": 2, "four": 3, "five": 4,
    "first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4,
}  # fmt: skip
_BY_POSITION = re.compile(
    r"""(?:\b(?:option|choice)\s+(?:number\s+)?(?P<number>\d|[A-E](?![A-Za-z])|one|two|three|four|five)\b
      |\b(?P<ordinal>first|second|third|fourth|fifth)\s+(?:option|choice)\b
      |\bindex\s+(?P<index>\d)\b)""",
    re.VERBOSE | re.IGNORECASE,
)


def names(feedback: str, option: str) -> bool:
    """Whether the feedback gives the option's number, as the option writes it."""
    read = written(option)
    if read is None:
        return False
    form = _SAME_FORM.get(read.form, read.form)
    return any(
        number.value == read.value and _SAME_FORM.get(number.form, number.form) is form
        for number in numbers_in(plain_maths(feedback))
    )


def _position(found: re.Match) -> int:
    if found["index"]:
        return int(found["index"])
    if found["ordinal"]:
        return _WORD_AT[found["ordinal"].lower()]
    said = found["number"]
    if said.isdigit():
        return int(said) - 1
    return (
        _WORD_AT[said.lower()] if said.lower() in _WORD_AT else ord(said.upper()) - 65
    )


def pointed_at(feedback: str) -> set[int]:
    """The positions (from 0) of the options the feedback points at."""
    return {_position(found) for found in _BY_POSITION.finditer(feedback)}


def _named(feedback: str, options: list[str]) -> set[int]:
    return {at for at, option in enumerate(options) if names(feedback, option)}


def contradiction(
    options: list[str], marked: int, right_feedback: str, wrong_feedback: str
) -> str | None:
    """Why the feedback cannot be shown beside the key, or None."""
    for text in (right_feedback, wrong_feedback):
        if said := self_correction(text):
            return f"the feedback corrects itself ({said!r})"
    pointed = pointed_at(right_feedback)
    if pointed and marked not in pointed:
        return "the feedback points at an option other than the one marked right"
    named = _named(right_feedback, options)
    # An option that is not a plain number cannot be looked for in the text.
    if named and marked not in named and written(options[marked]) is not None:
        other = options[min(named)]
        return f"the feedback gives {other!r}, not the option marked right"
    return None
