"""What to do with a turn that is not finished: run it again, or give up on it."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .fold import TurnState

# A watchdog alarm is set this far ahead before every run, so a run that dies is found.
WATCHDOG_MS = 30_000
# One run, from its first model call to the end of the turn.
RUN_DEADLINE_S = 120
# Runs in a row that kept nothing, before the turn is given up on.
MAX_STALLED_RUNS = 3
# Time since the turn last kept anything, before it is given up on.
GIVE_UP_AFTER_MS = 5 * 60 * 1000
# Time since the turn began, however much it kept, before it is given up on.
MAX_TURN_MS = 10 * 60 * 1000
# The wait after a run that failed with an error, before the next.
RETRY_AFTER_MS = 2_000

NO_PROGRESS = "no_progress"
STALLED = "stalled"
UNSAFE_TO_REPEAT = "unsafe_to_repeat"
UNREADABLE = "unreadable"


@dataclass(frozen=True)
class Run:
    """Run the turn, as its next run."""


@dataclass(frozen=True)
class Stop:
    """End the turn with the words it has: the learner stopped it."""


@dataclass(frozen=True)
class GiveUp:
    cause: str


def next_step(
    state: TurnState, now_ms: int, repeatable: Callable[[str], bool]
) -> Run | Stop | GiveUp:
    """A turn the learner stopped ends with its words. Any other that has not finished is run again unless it cannot get anywhere: its last runs kept
    nothing, it has kept nothing for five minutes, or a run was cut off in a tool that must not be
    sent twice."""
    if state.stop_requested:
        return Stop()
    if not state.job:
        return GiveUp(UNREADABLE)
    unsafe = [tool for tool in state.open_tools if not repeatable(tool)]
    if unsafe:
        return GiveUp(UNSAFE_TO_REPEAT)
    if state.stalled_runs >= MAX_STALLED_RUNS:
        return GiveUp(NO_PROGRESS)
    if state.runs and (
        now_ms - state.progressed_at > GIVE_UP_AFTER_MS
        or now_ms - state.started_at > MAX_TURN_MS
    ):
        return GiveUp(STALLED)
    return Run()
