"""A written expression worked out exactly, in the order school teaches
(brackets, of, division and multiplication, addition and subtraction), with
at most one unknown letter, in which it must stay linear.

Anything outside that, a unit that does not add up or a percentage anywhere
but "20% of 50", is NotComputable: a check left alone, never a guess."""

from __future__ import annotations

from dataclasses import dataclass, replace
from fractions import Fraction

from .tokens import Form, Kind, Token, is_plain_fraction
from .units import Unit

MAX_TOKENS = 60
MAX_EXPONENT = 12
MAX_MAGNITUDE = Fraction(10**15)


class NotComputable(ValueError):
    pass


@dataclass(frozen=True)
class Amount:
    """slope × the unknown + constant, in unit, or a bare percentage."""

    constant: Fraction
    slope: Fraction = Fraction(0)
    unit: Unit | None = None
    percent: bool = False

    @property
    def known(self) -> bool:
        return self.slope == 0


def _plain(*amounts: Amount) -> None:
    """A percentage is only ever the left of "of", or all there is."""
    if any(amount.percent for amount in amounts):
        raise NotComputable("a percentage outside 'of'")


def _checked(amount: Amount) -> Amount:
    if max(abs(amount.constant), abs(amount.slope)) > MAX_MAGNITUDE:
        raise NotComputable("too large")
    return amount


def _add(left: Amount, right: Amount, sign: int) -> Amount:
    _plain(left, right)
    if left.unit != right.unit:
        raise NotComputable("units that do not add")
    return Amount(
        left.constant + sign * right.constant,
        left.slope + sign * right.slope,
        left.unit,
    )


def _times(left: Amount, right: Amount) -> Amount:
    if not (left.known or right.known) or (left.unit and right.unit):
        raise NotComputable("not linear, or units multiplied")
    scale, other = (left, right) if left.known else (right, left)
    return Amount(
        scale.constant * other.constant,
        scale.constant * other.slope,
        left.unit or right.unit,
    )


def _multiply(left: Amount, right: Amount) -> Amount:
    _plain(left, right)
    return _times(left, right)


def _of(left: Amount, right: Amount) -> Amount:
    _plain(right)
    if left.unit:
        raise NotComputable("a unit before 'of'")
    return _times(replace(left, percent=False), right)


def _divide(left: Amount, right: Amount) -> Amount:
    _plain(left, right)
    if not right.known or right.unit or right.constant == 0:
        raise NotComputable("division by an unknown, a unit or zero")
    return Amount(
        left.constant / right.constant, left.slope / right.constant, left.unit
    )


def _power(base: Amount, exponent: Amount) -> Amount:
    _plain(base, exponent)
    power = exponent.constant
    if not (base.known and exponent.known) or base.unit or exponent.unit:
        raise NotComputable("a power of an unknown or a unit")
    if power.denominator != 1 or not 0 <= power <= MAX_EXPONENT:
        raise NotComputable("an exponent that is not a small whole number")
    if base.constant == 0 and power == 0:
        raise NotComputable("zero to the power zero")
    return Amount(base.constant ** int(power))


_BINARY = {"+": 1, "-": -1}
_PRODUCTS = {"×": _multiply, "÷": _divide, "/": _divide}


class _Reader:
    def __init__(self, tokens: list[Token], unknown: str | None) -> None:
        if not tokens or len(tokens) > MAX_TOKENS:
            raise NotComputable("empty or too long")
        self.tokens = tokens
        self.unknown = unknown
        self.at = 0

    def peek(self) -> Token | None:
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def take(self) -> Token:
        token = self.peek()
        if token is None:
            raise NotComputable("ends early")
        self.at += 1
        return token

    def is_operator(self, *symbols: str) -> bool:
        token = self.peek()
        return (
            token is not None and token.kind is Kind.OPERATOR and token.text in symbols
        )

    def whole(self) -> Amount:
        amount = self.sum()
        if self.peek() is not None:
            raise NotComputable(f"unread {self.peek().text!r}")
        return _checked(amount)

    def sum(self) -> Amount:
        amount = self.product()
        while self.is_operator(*_BINARY):
            sign = _BINARY[self.take().text]
            amount = _checked(_add(amount, self.product(), sign))
        return amount

    def product(self) -> Amount:
        """One term. After a division, another ×, ÷ or implied × in the same
        term, or a fraction typed with a slash, has no one reading: 24 ÷ 4 × 2
        is 12 left to right and 3 to some; 8 ÷ 2(2 + 2) is 16 or 1."""
        plain = is_plain_fraction(self.peek())
        amount = self.of()
        divided = False
        while (combine := self._combining()) is not None:
            if divided:
                raise NotComputable("more after a division, which reads two ways")
            divided = combine is _divide
            plain = plain or is_plain_fraction(self.peek())
            if divided and plain:
                raise NotComputable("a division beside a typed fraction")
            amount = _checked(combine(amount, self.of()))
        return amount

    def _combining(self):
        """The product operator next, taken, or None where the term ends."""
        if self.is_operator(*_PRODUCTS):
            return _PRODUCTS[self.take().text]
        return _multiply if self._implicit() else None

    def _implicit(self) -> bool:
        """2x and 3(x + 1): a letter or a bracket straight after a value.
        Never after a fraction: 1/2x may mean 1/(2x)."""
        token, before = self.peek(), self.tokens[self.at - 1]
        if before.number and before.number.form in (Form.FRACTION, Form.MIXED):
            return False
        return token is not None and (
            token.kind is Kind.LETTER
            or (token.kind is Kind.OPERATOR and token.text == "(")
        )

    def of(self) -> Amount:
        amount = self.power()
        while (token := self.peek()) is not None and token.text == "of":
            self.take()
            amount = _checked(_of(amount, self.power()))
        return amount

    def power(self) -> Amount:
        negated = self.is_operator("-")
        base = self.signed()
        if not self.is_operator("^"):
            return base
        if negated:
            raise NotComputable("-3^2 may mean -(3^2) or (-3)^2")
        self.take()
        return _checked(_power(base, self.signed()))

    def signed(self) -> Amount:
        if self.is_operator("-"):
            self.take()
            amount = self.signed()
            _plain(amount)
            return Amount(-amount.constant, -amount.slope, amount.unit)
        return self.percent(self.atom())

    def percent(self, amount: Amount) -> Amount:
        token = self.peek()
        if token is None or token.kind is not Kind.PERCENT:
            return amount
        self.take()
        if not amount.known or amount.unit or amount.percent:
            raise NotComputable("a percentage of an unknown or a unit")
        return Amount(amount.constant / 100, percent=True)

    def atom(self) -> Amount:
        token = self.take()
        if token.kind is Kind.CURRENCY:
            return self._in_unit(self._number(self.take()), token.unit)
        if token.kind is Kind.NUMBER:
            return self._with_unit(self._number(token))
        if token.kind is Kind.LETTER and token.text == self.unknown:
            return Amount(Fraction(0), Fraction(1))
        if token.kind is Kind.OPERATOR and token.text == "(":
            inner = self.sum()
            closing = self.take()
            if closing.text != ")":
                raise NotComputable("an unclosed bracket")
            return inner
        raise NotComputable(f"unexpected {token.text!r}")

    @staticmethod
    def _number(token: Token) -> Amount:
        if token.kind is not Kind.NUMBER:
            raise NotComputable("a currency sign without a number")
        return Amount(token.number.value)

    def _with_unit(self, amount: Amount) -> Amount:
        token = self.peek()
        if token is not None and token.kind is Kind.UNIT:
            self.take()
            return self._in_unit(amount, token.unit)
        return amount

    @staticmethod
    def _in_unit(amount: Amount, unit: Unit | None) -> Amount:
        return replace(amount, unit=unit)


def worked_out(tokens: list[Token], unknown: str | None = None) -> Amount:
    """The expression's value, linear in ``unknown`` when it is given."""
    return _Reader(tokens, unknown).whole()
