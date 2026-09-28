"""The units a school conversion uses, each as a whole number of the smallest
unit of its kind, so every conversion is exact."""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction


@dataclass(frozen=True)
class Unit:
    name: str
    kind: str
    size: Fraction

    def to(self, other: Unit, amount: Fraction) -> Fraction:
        return amount * self.size / other.size


def _units(kind: str, sizes: dict[str, tuple[int, tuple[str, ...]]]) -> dict[str, Unit]:
    named: dict[str, Unit] = {}
    for name, (size, spellings) in sizes.items():
        unit = Unit(name, kind, Fraction(size))
        named |= {spelling: unit for spelling in (name, *spellings)}
    return named


def _spelt(word: str) -> tuple[str, ...]:
    """British and American spellings, singular and plural."""
    american = word.replace("metre", "meter").replace("litre", "liter")
    return tuple({word, f"{word}s", american, f"{american}s"})


_BY_NAME: dict[str, Unit] = {
    **_units(
        "length",
        {
            "mm": (1, _spelt("millimetre")),
            "cm": (10, _spelt("centimetre")),
            "m": (1000, _spelt("metre")),
            "km": (1_000_000, _spelt("kilometre")),
        },
    ),
    **_units(
        "mass",
        {
            "mg": (1, _spelt("milligram")),
            "g": (1000, _spelt("gram")),
            "kg": (1_000_000, _spelt("kilogram")),
            "tonne": (1_000_000_000, ("tonnes",)),
        },
    ),
    **_units(
        "volume",
        {
            "ml": (1, (*_spelt("millilitre"), "mL")),
            "l": (1000, (*_spelt("litre"), "L")),
        },
    ),
    **_units(
        "time",
        {
            "second": (1, ("seconds", "sec", "secs")),
            "minute": (60, ("minutes", "min", "mins")),
            "hour": (3600, ("hours", "hr", "hrs")),
            "day": (86_400, ("days",)),
            "week": (604_800, ("weeks",)),
        },
    ),
    **_units("money", {"kobo": (1, ()), "naira": (100, ("₦",))}),
}

# Letters that are units after a number, and a variable in an equation.
LETTER_UNITS = frozenset({"m", "g", "l"})


def unit_named(word: str) -> Unit | None:
    return _BY_NAME.get(word) or _BY_NAME.get(word.lower())
