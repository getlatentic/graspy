"""Plain maths text as tokens: numbers read exactly, with the form they are
written in, and anything the checks cannot read refusing the whole text."""

from __future__ import annotations

import math
import re
from collections.abc import Iterator
from dataclasses import dataclass
from enum import StrEnum
from fractions import Fraction

from .units import LETTER_UNITS, Unit, unit_named


class Form(StrEnum):
    WHOLE = "whole number"
    DECIMAL = "decimal"
    FRACTION = "fraction"
    MIXED = "mixed number"
    PERCENT = "percentage"


class Kind(StrEnum):
    NUMBER = "number"
    OPERATOR = "operator"
    PERCENT = "percent"
    EQUALS = "equals"
    BLANK = "blank"
    LETTER = "letter"
    UNIT = "unit"
    CURRENCY = "currency"
    WORD = "word"
    BREAK = "break"


@dataclass(frozen=True)
class Number:
    value: Fraction
    form: Form
    lowest: bool = True


@dataclass(frozen=True)
class Token:
    kind: Kind
    text: str
    number: Number | None = None
    unit: Unit | None = None


_DIGITS = r"(?:\d{1,3}(?:,\d{3})+|\d+)"
_PATTERN = re.compile(
    rf"""
    (?P<space>\s+)
    |(?P<mixed>(?<![\d.,/⁄])(?P<whole>\d+)\ (?P<top>\d+)[/⁄](?P<bottom>\d+)(?![\d/⁄]|\.\d))
    |(?P<fraction>(?<![\d.,/⁄])(?P<numerator>\d+)[/⁄](?P<denominator>\d+)(?![\d/⁄]|\.\d))
    |(?P<decimal>(?<![\d.,])(?P<int>{_DIGITS})\.(?P<places>\d*)\[(?P<repeat>\d+)\]
        |(?<![\d.,]){_DIGITS}\.\d+(?!\.\d))
    |(?P<integer>(?<![\d.,]){_DIGITS}(?![\d.,]\d))
    |(?P<percent>%)
    |(?P<operator>[-+×÷/^()])
    |(?P<equals>=)
    |(?P<blank>_)
    |(?P<currency>₦|N(?=\d))
    |(?P<word>[A-Za-z]+(?:[-‑'’][A-Za-z]+)*)
    |(?P<break>[.,:;!?"“”'‘’])
    |(?P<bad>.)
    """,
    re.VERBOSE,
)


def _recurring(found: re.Match) -> Fraction:
    """0.1[6] is 0.1666…: the repeating digits over as many nines."""
    whole = int(found["int"].replace(",", ""))
    places, repeat = found["places"], found["repeat"]
    fixed = Fraction(int(places or "0"), 10 ** len(places))
    cycle = Fraction(int(repeat), (10 ** len(repeat) - 1) * 10 ** len(places))
    return whole + fixed + cycle


def _number(found: re.Match) -> Number | None:
    if found["mixed"]:
        top, bottom = int(found["top"]), int(found["bottom"])
        if bottom == 0 or top >= bottom:
            return None
        value = int(found["whole"]) + Fraction(top, bottom)
        return Number(value, Form.MIXED, math.gcd(top, bottom) == 1)
    if found["fraction"]:
        top, bottom = int(found["numerator"]), int(found["denominator"])
        if bottom == 0:
            return None
        lowest = math.gcd(top, bottom) == 1 and bottom != 1
        return Number(Fraction(top, bottom), Form.FRACTION, lowest)
    if found["repeat"]:
        return Number(_recurring(found), Form.DECIMAL)
    written = found.group().replace(",", "")
    form = Form.DECIMAL if "." in written else Form.WHOLE
    return Number(Fraction(written), form)


def _token(found: re.Match) -> Token | None:
    kind = found.lastgroup
    text = found.group()
    if kind in ("mixed", "fraction", "decimal", "integer"):
        number = _number(found)
        return Token(Kind.NUMBER, text, number=number) if number else None
    if kind == "word":
        return _word(text)
    if kind == "currency":
        return Token(Kind.CURRENCY, text, unit=unit_named("naira"))
    return Token(Kind(kind), text)


def _word(text: str) -> Token:
    word = text.lower().replace("’", "'")
    if len(word) == 1:
        return Token(Kind.LETTER, word)
    unit = unit_named(text)
    if unit is not None:
        return Token(Kind.UNIT, word, unit=unit)
    return Token(Kind.WORD, word)


_MATHS = frozenset({Kind.NUMBER, Kind.OPERATOR, Kind.EQUALS, Kind.PERCENT})


def _read_in_place(tokens: list[Token]) -> list[Token]:
    """ "a" and "i" are words unless maths stands beside them, as in 2a + 3,
    but not "a 1.2 L bottle";
    a question mark after an equals sign is the blank to fill."""
    read = []
    for at, token in enumerate(tokens):
        before = tokens[at - 1].kind if at else None
        after = tokens[at + 1].kind if at + 1 < len(tokens) else None
        if token.kind is Kind.LETTER and token.text in ("a", "i"):
            if before not in _MATHS and after not in _MATHS - {Kind.NUMBER}:
                token = Token(Kind.WORD, token.text)
        elif token.text == "?" and before is Kind.EQUALS:
            token = Token(Kind.BLANK, token.text)
        read.append(token)
    return read


def tokens(text: str) -> list[Token] | None:
    """None when any part of the text is not maths or a word."""
    found: list[Token] = []
    for match in _PATTERN.finditer(text):
        if match.lastgroup == "space":
            continue
        token = None if match.lastgroup == "bad" else _token(match)
        if token is None:
            return None
        found.append(token)
    return _read_in_place(found)


def numbers_in(text: str) -> Iterator[Number]:
    """Every number written in text, whatever is around it: "40%" is the
    percentage 2/5."""
    for match in _PATTERN.finditer(text):
        if match.lastgroup not in ("mixed", "fraction", "decimal", "integer"):
            continue
        number = _number(match)
        if number is None:
            continue
        if text[match.end() :].lstrip().startswith("%"):
            number = Number(number.value / 100, Form.PERCENT)
        yield number


def is_plain_fraction(token: Token | None) -> bool:
    """ "6/2" typed with a slash, which may be read as a division; a fraction
    written as one (\\frac{6}{2}, ½) may not."""
    return token is not None and token.kind is Kind.NUMBER and "/" in token.text


def is_letter_unit(token: Token) -> bool:
    return token.kind is Kind.LETTER and token.text in LETTER_UNITS
