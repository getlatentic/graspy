"""A question's tokens split into its maths, each run of it a span, and the
words around them."""

from __future__ import annotations

from dataclasses import dataclass

from .tokens import Kind, Token, is_letter_unit
from .units import unit_named

# Where a span or a punctuation mark stands among the words.
SPAN = "#"
BREAK = "|"

_ALWAYS_MATHS = frozenset(
    {
        Kind.NUMBER,
        Kind.OPERATOR,
        Kind.PERCENT,
        Kind.EQUALS,
        Kind.BLANK,
        Kind.CURRENCY,
    }
)
_ENDS_VALUE = frozenset({Kind.NUMBER, Kind.PERCENT, Kind.UNIT, Kind.LETTER})
_STARTS_VALUE = frozenset({Kind.NUMBER, Kind.CURRENCY, Kind.LETTER})


@dataclass(frozen=True)
class Split:
    spans: list[list[Token]]
    words: list[str]
    # Letters and units standing among the words: "solve for x", "to cm".
    named: list[Token]


def _in_maths(tokens: list[Token], at: int) -> bool:
    token = tokens[at]
    if token.kind in _ALWAYS_MATHS:
        return True
    if token.kind is Kind.LETTER:
        beside = (tokens[i] for i in (at - 1, at + 1) if 0 <= i < len(tokens))
        return any(other.kind in _ALWAYS_MATHS for other in beside)
    if token.kind is Kind.UNIT:
        return at > 0 and tokens[at - 1].kind in (Kind.NUMBER, Kind.BLANK)
    return False


def _joins(tokens: list[Token], at: int, maths: list[bool]) -> bool:
    """ "of" between two values is multiplication: 20% of 50, 3/4 of ₦200."""
    if tokens[at].text != "of" or not 0 < at < len(tokens) - 1:
        return False
    before, after = tokens[at - 1], tokens[at + 1]
    ends = maths[at - 1] and (before.kind in _ENDS_VALUE or before.text == ")")
    starts = after.kind in _STARTS_VALUE or after.text in ("(", "-")
    return ends and starts


def _word(token: Token) -> str:
    return BREAK if token.kind is Kind.BREAK else token.text


def split(tokens: list[Token]) -> Split:
    maths = [_in_maths(tokens, at) for at in range(len(tokens))]
    maths = [inside or _joins(tokens, at, maths) for at, inside in enumerate(maths)]
    spans: list[list[Token]] = []
    words: list[str] = []
    named: list[Token] = []
    for at, token in enumerate(tokens):
        if not maths[at]:
            words.append(_word(token))
            if token.kind in (Kind.LETTER, Kind.UNIT):
                named.append(token)
            continue
        if not (at and maths[at - 1]):
            spans.append([])
            words.append(SPAN)
        spans[-1].append(token)
    return Split(spans, words, named)


def letters_as_units(tokens: list[Token]) -> list[Token]:
    """Outside an equation, m, g and l after a number or among the words
    ("2.5 m", "to m") are metres, grams and litres."""
    return [
        Token(Kind.UNIT, token.text, unit=unit_named(token.text))
        if is_letter_unit(token)
        else token
        for token in tokens
    ]
