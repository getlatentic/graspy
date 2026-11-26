"""What a tutor turn can make while it runs, and what it may spend doing so: the paths it plans
and the lessons it has made, for the learner the turn is for."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

from ..caller import Caller
from ..domains.path.service import Revision
from ..security.rate_limit import Limiter

# The runner's deadline for a turn, and what the tutor keeps back of it to write its answer.
TURN_SECONDS = 120
ANSWER_SECONDS = 30


class PathPlanner(Protocol):
    async def plan_path(
        self,
        country: str,
        language: str,
        grade_level: str,
        goal: str,
        revision: Revision | None = None,
    ) -> dict: ...


@dataclass(frozen=True)
class GenerationBudget:
    """The generation budget a request counts against (the generate limiter, which the routes
    that plan and make things are under), kept per source of the request: a turn's plans and
    lessons are spent from it as the same work asked of a route would be."""

    limiter: Limiter | None
    # The learner, or the network address of a visitor; None when the request names neither, and
    # nothing is then made: a key a client chose would be a fresh budget each time.
    key: str | None

    async def spend(self) -> bool:
        """False when the source has made too much in the minute, or is not known. With no limiter
        bound, as in a local run, there is no limit."""
        if self.limiter is None:
            return True
        return self.key is not None and await self.limiter.allow(self.key)


@dataclass(frozen=True)
class Workshop:
    planner: PathPlanner
    # Who the lessons are made for; a visitor with no record has none kept.
    caller: Caller
    budget: GenerationBudget
    # When the turn began, by `now`: the turn has TURN_SECONDS in all (turns/runner.py), and what it
    # makes may not use the time its answer still needs.
    started: float = field(default_factory=time.monotonic)
    now: Callable[[], float] = time.monotonic

    def seconds_left(self) -> float:
        """How long the turn may still wait for what it makes."""
        return TURN_SECONDS - ANSWER_SECONDS - (self.now() - self.started)
