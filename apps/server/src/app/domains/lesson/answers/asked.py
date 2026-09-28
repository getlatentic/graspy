"""What a question asks, worked out: its exact answer and the form it is
wanted in."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from fractions import Fraction

from .units import Unit
from .wanted import Wanted


class Worked(StrEnum):
    ARITHMETIC = "arithmetic"
    CONVERSION = "conversion"
    UNITS = "units"
    EQUATION = "equation"


@dataclass(frozen=True)
class Asked:
    value: Fraction
    wanted: Wanted
    worked: Worked
    # The unit value is in, asked for or not: "750 g + 250 g" is in grams,
    # and 1 kg answers it as well as 1000 g.
    unit: Unit | None = None
    # What is counted, which an option may name: "10 mangoes".
    nouns: frozenset[str] = field(default_factory=frozenset)
