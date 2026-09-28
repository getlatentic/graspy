"""A calculation: arithmetic ("What is 20% of ₦50?"), a number in another
form ("Write 2/5 as a decimal") or a quantity in another unit ("How many grams
are in 3.5 kg?").

Before its maths, every word must ask for a value (words.ASKING): a word
problem tells a story there. After it, a noun may name what is counted, up
to the end of the sentence, but no word may change what is asked; a sentence
after that may only say how to give the answer."""

from __future__ import annotations

from .asked import Asked, Worked
from .equation import sides
from .expression import Amount, NotComputable, worked_out
from .spans import BREAK, SPAN, Split
from .tokens import Kind, Token
from .units import Unit
from .wanted import Wanted, wanted
from .words import ASKING, CHANGING, NOT_THE_VALUE

# "the sum of 1/4 and 1/6": two values joined by the operation named.
_JOINING = {"sum": "+", "total": "+", "product": "×"}


def _bracketed(span: list[Token]) -> list[Token]:
    return [Token(Kind.OPERATOR, "("), *span, Token(Kind.OPERATOR, ")")]


def _joined(read: Split) -> Split:
    """ "sum of # and #" as one span."""
    words = read.words
    for at in range(len(words) - 4):
        name, of, first, conjunction, second = words[at : at + 5]
        if (of, first, conjunction, second) != ("of", SPAN, "and", SPAN):
            continue
        if name in _JOINING and len(read.spans) == 2:
            operator = Token(Kind.OPERATOR, _JOINING[name])
            span = [*_bracketed(read.spans[0]), operator, *_bracketed(read.spans[1])]
            return Split([span], [*words[: at + 2], SPAN, *words[at + 5 :]], read.named)
    return read


def _nouns(read: Split) -> frozenset[str]:
    """The words after the maths, up to the end of its sentence, that are not
    asking words: what is counted. Raises when one changes the question."""
    named = {token.text for token in read.named}
    at = read.words.index(SPAN)
    before, after = read.words[:at], read.words[at + 1 :]
    ending = after.index(BREAK) if BREAK in after else len(after)
    sentence, rest = set(after[:ending]) - named, set(after[ending:]) - named
    if not set(before) - named - {BREAK} <= ASKING:
        raise NotComputable("a story before the maths")
    if sentence & NOT_THE_VALUE or not rest - {BREAK} <= ASKING:
        raise NotComputable("words that change what is asked")
    return frozenset(sentence - ASKING)


def _expression(span: list[Token]) -> tuple[list[Token], Unit | None]:
    """The maths to work out, and the unit a blank after it asks for:
    "3.5 kg = ___ g"."""
    kinds = [token.kind for token in span]
    if Kind.EQUALS not in kinds:
        if Kind.BLANK in kinds:
            raise NotComputable("a blank without an equals sign")
        return span, None
    left, right = sides(span)
    if right[0].kind is not Kind.BLANK or Kind.BLANK in kinds[: len(left)]:
        raise NotComputable("an equals sign not followed by a blank")
    if len(right) > 2 or (len(right) == 2 and right[1].kind is not Kind.UNIT):
        raise NotComputable("a blank followed by more than a unit")
    return left, right[1].unit if len(right) == 2 else None


def _lone(expression: list[Token]) -> bool:
    kinds = [token.kind for token in expression]
    return kinds.count(Kind.NUMBER) == 1 and set(kinds) <= {
        Kind.NUMBER,
        Kind.PERCENT,
        Kind.UNIT,
        Kind.CURRENCY,
    }


def _target(read: Split, after_blank: Unit | None, amount: Amount) -> Unit | None:
    """The unit the answer is asked in, which must be one the amount can be
    changed to."""
    targets = {token.unit for token in read.named} | ({after_blank} - {None})
    if len(targets) > 1:
        raise NotComputable("two units asked for")
    target = targets.pop() if targets else None
    if target and (amount.unit is None or amount.unit.kind != target.kind):
        raise NotComputable("a unit asked for that the amount is not in")
    return target


def _worked(
    read: Split, expression: list[Token], shape: Wanted, nouns: frozenset[str]
) -> Worked:
    if shape.unit:
        return Worked.UNITS
    if not _lone(expression):
        return Worked.ARITHMETIC
    if not (shape.form or shape.lowest or set(read.words) & CHANGING):
        raise NotComputable("a number alone, not to be changed")
    if nouns:
        # "What percentage of the 2 GB bundle has been used?" asks about a
        # part the slide gave, not about 2.
        raise NotComputable("a number in a story")
    return Worked.CONVERSION


def calculation(read: Split) -> Asked:
    read = _joined(read)
    if len(read.spans) != 1 or any(t.kind is Kind.LETTER for t in read.named):
        raise NotComputable("not one calculation")
    nouns = _nouns(read)
    expression, after_blank = _expression(read.spans[0])
    amount = worked_out(expression)
    target = _target(read, after_blank, amount)
    shape = wanted(read.words, target)
    worked = _worked(read, expression, shape, nouns)
    value = amount.unit.to(target, amount.constant) if target else amount.constant
    return Asked(value, shape, worked, target or amount.unit, nouns)
