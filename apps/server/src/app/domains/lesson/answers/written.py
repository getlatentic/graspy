r"""An answer option as the number it gives, in the form it is written:
"\(\frac{2}{5}\)", "0.4", "40\%", "2 1/2", "x = 4", "250 cm" or "₦300".
Anything more, a word or a second number, is not read."""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

from .maths_text import plain_maths
from .spans import letters_as_units
from .tokens import Form, Kind, Number, Token, tokens
from .units import Unit


@dataclass(frozen=True)
class Written:
    value: Fraction
    form: Form
    lowest: bool
    unit: Unit | None = None


def _without_letter(read: list[Token]) -> list[Token]:
    """ "x = 4" is 4."""
    if len(read) > 2 and read[0].kind is Kind.LETTER and read[1].kind is Kind.EQUALS:
        return read[2:]
    return read


def _without_full_stop(read: list[Token]) -> list[Token]:
    return read[:-1] if read and read[-1].kind is Kind.BREAK else read


def _taken(read: list[Token], kind: Kind, text: str | None = None) -> Token | None:
    if read and read[0].kind is kind and text in (None, read[0].text):
        return read.pop(0)
    return None


def _without_nouns(read: list[Token], nouns: frozenset[str]) -> list[Token]:
    """ "10 mangoes" is 10 when the question counts mangoes."""
    while read and read[-1].kind is Kind.WORD and read[-1].text in nouns:
        read = read[:-1]
    return read


def written(option: str, nouns: frozenset[str] = frozenset()) -> Written | None:
    read = tokens(plain_maths(option))
    if read is None:
        return None
    read = _without_nouns(_without_full_stop(_without_letter(read)), nouns)
    read = letters_as_units(read)
    negative = _taken(read, Kind.OPERATOR, "-") is not None
    currency = _taken(read, Kind.CURRENCY)
    number = _taken(read, Kind.NUMBER)
    percent = _taken(read, Kind.PERCENT) is not None
    unit = _taken(read, Kind.UNIT)
    if read or number is None or (percent and (currency or unit)):
        return None
    return _value(number.number, negative, percent, currency or unit)


def _value(
    number: Number, negative: bool, percent: bool, unit: Token | None
) -> Written:
    value = -number.value if negative else number.value
    if percent:
        return Written(value / 100, Form.PERCENT, True)
    return Written(value, number.form, number.lowest, unit.unit if unit else None)
