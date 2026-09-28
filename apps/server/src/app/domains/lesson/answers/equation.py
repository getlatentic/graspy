"""One linear equation in one letter, solved exactly. Every word before it
must only lead to it ("Find the value of x in the equation…"), and every word
after it may only ask for the letter: "a quarter of x = 3" and "Solve
2x = 10. How much do two pens cost?" ask for something else."""

from __future__ import annotations

import re

from .asked import Asked, Worked
from .expression import NotComputable, worked_out
from .spans import BREAK, SPAN, Split
from .tokens import Kind, Token
from .wanted import wanted
from .words import ASKING_FOR_THE_LETTER, LEADING_TO_THE_EQUATION, NOT_THE_LETTER


def is_equation(span: list[Token]) -> bool:
    """An equals sign with a letter and no blank: 2x + 3 = 11, not 2.5 m = ? cm."""
    kinds = [token.kind for token in span]
    return Kind.EQUALS in kinds and Kind.LETTER in kinds and Kind.BLANK not in kinds


def sides(span: list[Token]) -> tuple[list[Token], list[Token]]:
    at = [token.kind for token in span].index(Kind.EQUALS)
    left, right = span[:at], span[at + 1 :]
    if not left or not right or any(token.kind is Kind.EQUALS for token in right):
        raise NotComputable("not one equals sign between two sides")
    return left, right


def _letter(span: list[Token], named: list[Token]) -> str:
    letters = {token.text for token in span + named if token.kind is Kind.LETTER}
    if len(letters) != 1 or any(token.kind is Kind.UNIT for token in span + named):
        raise NotComputable("not one letter, or a unit in an equation")
    return letters.pop()


def _asks_for(letter: str, words: list[str]) -> bool:
    said = " ".join(words)
    return any(
        re.search(pattern, said)
        for pattern in (
            r"\bsolve\b",
            rf"\bvalue of {letter}\b",
            rf"\b(?:what|find|calculate|determine|work out) (?:is )?{letter}\b",
            rf"\bfor {letter}\b",
        )
    )


def _only_leads_to_it(letter: str, words: list[str]) -> bool:
    """Every word before the equation leads to it, and every word after it,
    in its sentence and any after it, asks for the letter."""
    at = words.index(SPAN)
    before, after = set(words[:at]), set(words[at + 1 :])
    return before - {BREAK, letter} <= LEADING_TO_THE_EQUATION and (
        after - {BREAK, letter} <= ASKING_FOR_THE_LETTER
    )


def equation(read: Split) -> Asked:
    if len(read.spans) != 1:
        raise NotComputable("more maths than the equation")
    span = read.spans[0]
    letter = _letter(span, read.named)
    left, right = sides(span)
    if set(read.words) & NOT_THE_LETTER or not _asks_for(letter, read.words):
        raise NotComputable("the question may ask for something else")
    if not _only_leads_to_it(letter, read.words):
        raise NotComputable("words around the equation that may ask for more")
    left_side, right_side = worked_out(left, letter), worked_out(right, letter)
    slope = left_side.slope - right_side.slope
    if slope == 0:
        raise NotComputable("no single solution")
    value = (right_side.constant - left_side.constant) / slope
    return Asked(value, wanted(read.words), Worked.EQUATION)
