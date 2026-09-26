"""What one times-table recitation asks of a learner.

The reading and the marking of a recitation belong to the teacher agent, which hears each fact and
compares it to the truth. What stays here is the question itself: which table, and which of its
facts this prompt asks for.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RecitationExercise:
    table: int
    multipliers: tuple[int, ...]

    @property
    def start(self) -> int:
        return self.multipliers[0]

    @property
    def end(self) -> int:
        return self.multipliers[-1]

    @property
    def targeted(self) -> bool:
        return self.multipliers != tuple(range(1, 13))

    def expected(self, multiplier: int) -> int:
        return self.table * multiplier

    def to_json(self) -> dict:
        return {
            "kind": "times_table_recitation",
            "table": self.table,
            "from": self.start,
            "to": self.end,
            "multipliers": list(self.multipliers),
        }
