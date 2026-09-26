"""Deterministic marking of a spoken sequence: days, months, counting, anything said in order."""

import re
from dataclasses import dataclass

from .spoken_numbers import normalize, spellings


@dataclass(frozen=True)
class SequenceItem:
    id: str
    spoken: tuple[str, ...]


@dataclass(frozen=True)
class SequenceResult:
    said: list[str]
    missing: list[str]
    out_of_order: list[str]

    def to_json(self) -> dict:
        return {
            "said": self.said,
            "missing": self.missing,
            "out_of_order": self.out_of_order,
        }


def _first_positions(
    transcript: str, items: tuple[SequenceItem, ...]
) -> dict[str, int]:
    """Where each item was first said.

    Every occurrence of every spelling is collected, then the longest wins wherever two overlap,
    so `twenty-two` is that item alone and never also counts as `two`, and the letter `w` said as
    `double u` is not also the letter `u`.
    """
    spoken = f" {normalize(transcript)} "
    hits = []
    for item in items:
        for spelling in {form for alias in item.spoken for form in spellings(alias)}:
            for found in re.finditer(re.escape(f" {spelling} "), spoken):
                hits.append((found.start(), len(spelling), item.id))

    taken: list[tuple[int, int]] = []
    positions: dict[str, int] = {}
    for start, length, item_id in sorted(hits, key=lambda hit: (-hit[1], hit[0])):
        end = start + length
        if any(
            start < other_end and other_start < end for other_start, other_end in taken
        ):
            continue
        taken.append((start, end))
        positions[item_id] = min(positions.get(item_id, start), start)
    return positions


def evaluate_sequence(
    transcript: str, items: tuple[SequenceItem, ...]
) -> SequenceResult:
    """Items said in order count; one said before an earlier item is out of order."""
    positions = _first_positions(transcript, items)
    said, missing, out_of_order = [], [], []
    last = -1
    for item in items:
        position = positions.get(item.id)
        if position is None:
            missing.append(item.id)
        elif position < last:
            out_of_order.append(item.id)
        else:
            said.append(item.id)
            last = position
    return SequenceResult(said, missing, out_of_order)
