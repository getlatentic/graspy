"""A number as a child says it: digits, or English words with an optional unit
such as "naira", "twelve naira" or "one hundred and five"."""

from __future__ import annotations

import re

_UNITS = {
    word: value
    for value, word in enumerate(
        [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ]
    )
}
_TENS = {
    word: 10 * value
    for value, word in enumerate(
        [
            "_",
            "_",
            "twenty",
            "thirty",
            "forty",
            "fifty",
            "sixty",
            "seventy",
            "eighty",
            "ninety",
        ]
    )
    if word != "_"
}
_SCALES = {"hundred": 100, "thousand": 1000}
_FILLER = {
    "and",
    "a",
    "the",
    "is",
    "its",
    "it's",
    "naira",
    "mangoes",
    "oranges",
    "pencils",
    "answer",
}
_DIGITS = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def _from_words(words: list[str]) -> int | None:
    total = current = 0
    seen = False
    for word in words:
        if word in _UNITS:
            current += _UNITS[word]
        elif word in _TENS:
            current += _TENS[word]
        elif word in _SCALES:
            current = max(current, 1) * _SCALES[word]
            if _SCALES[word] == 1000:
                total, current = total + current, 0
        elif word in _FILLER:
            continue
        else:
            return None
        seen = True
    return total + current if seen else None


def spoken_number(text: str) -> int | None:
    """The whole number said, or None when it is not one."""
    cleaned = text.lower().replace("-", " ").strip(" .!?")
    found = _DIGITS.fullmatch(cleaned.replace(" ", "")) or _DIGITS.search(cleaned)
    if found:
        value = float(found.group().replace(",", ""))
        return int(value) if value == int(value) else None
    return _from_words(cleaned.split())
