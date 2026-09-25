"""An answer that repeats itself until it runs out.

gpt-oss-120b at temperature 0 can repeat one dash inside a markdown table up
to the 8,192-token ceiling (about 1 turn in 80, measured). Greedy decoding
makes such loops, so the turn is answered again with some sampling.
"""

from __future__ import annotations

import re

# A unit of up to eight characters 200 times in a row. An aligned table's
# separator row pads to more than fifty dashes; a loop runs to the ceiling.
REPEATS = 200
_RUN = re.compile(rf"(\S.{{0,7}}?)\1{{{REPEATS - 1},}}", re.DOTALL)
_TAIL = 8 * REPEATS + 100

RETRY_TEMPERATURE = 0.7


class Runaway(Exception):
    pass


class RunawayWatch:
    def __init__(self) -> None:
        self._tail = ""

    def add(self, chunk: str) -> None:
        """Raises before the chunk that completed a run is passed on."""
        self._tail = (self._tail + chunk)[-_TAIL:]
        if _RUN.search(self._tail):
            raise Runaway(f"The answer repeats {self._tail[-20:]!r}")
