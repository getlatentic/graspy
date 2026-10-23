"""A number as a child says it: digits or English words, with the thing counted
beside it ("twelve mangoes", "one hundred and five"). The whole utterance must
be one number: a hedge, a correction or two numbers is not an answer, because
a wrong answer must never be heard as a right one."""

from __future__ import annotations

import re

MAX_DIGITS = 9
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
_HEDGES = {
    "not",
    "no",
    "isnt",
    "isn't",
    "or",
    "maybe",
    "perhaps",
    "neither",
    "nor",
    "except",
    "dont",
    "don't",
    "cant",
    "can't",
    "wasnt",
    "wasn't",
    "half",
    "quarter",
    "third",
    "point",
    "minus",
    "negative",
}
_DIGITS = re.compile(r"[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+")


def _tokens(text: str) -> list[str]:
    cleaned = re.sub(r"[^\w',]", " ", text.lower().replace("-", " "), flags=re.ASCII)
    return [token.strip(",") for token in cleaned.split() if token.strip(",")]


def _words_value(words: list[str]) -> int | None:
    total = current = 0
    last = None
    for word in words:
        if word == "and":
            if last not in ("hundred", "thousand"):
                return None
        elif word in _UNITS:
            value = _UNITS[word]
            if not (
                last in (None, "hundred", "thousand", "and")
                or (last == "tens" and value < 10)
            ):
                return None
            current += value
            last = "units"
        elif word in _TENS:
            if last not in (None, "hundred", "thousand", "and"):
                return None
            current += _TENS[word]
            last = "tens"
        elif word == "hundred":
            if not 1 <= current <= 9 or last != "units":
                return None
            current *= 100
            last = "hundred"
        elif word == "thousand":
            if total or not 1 <= current <= 999:
                return None
            total, current, last = current * 1000, 0, "thousand"
        else:
            return None
    return total + current if last is not None else None


def spoken_number(text: str) -> int | None:
    """The whole number said, or None when the words are not exactly one."""
    tokens = _tokens(text)
    if any(token in _HEDGES for token in tokens):
        return None
    tokens = [
        "one"
        if token == "a" and tokens[at + 1 : at + 2] in (["hundred"], ["thousand"])
        else token
        for at, token in enumerate(tokens)
    ]
    digit_groups = [token for token in tokens if _DIGITS.fullmatch(token)]
    word_indexes = [
        i
        for i, token in enumerate(tokens)
        if token in _UNITS or token in _TENS or token in _SCALES
    ]
    if digit_groups and word_indexes:
        return None
    if digit_groups:
        digits = digit_groups[0].replace(",", "")
        return (
            int(digits)
            if len(digit_groups) == 1 and len(digits) <= MAX_DIGITS
            else None
        )
    if not word_indexes:
        return None
    first, last = word_indexes[0], word_indexes[-1]
    if "and" in tokens[:first] + tokens[last + 1 :]:
        return None
    return _words_value(tokens[first : last + 1])
