"""What a tutor turn can make while it runs, and what it may spend doing so: the paths it plans
and the lessons it has made, for the learner the turn is for."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..caller import Caller
from ..domains.path.service import Revision
from ..security.rate_limit import Limiter


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
    key: str

    async def spend(self) -> bool:
        """False when the source has made too much in the minute. With no limiter bound, as in a
        local run, there is no limit."""
        return self.limiter is None or await self.limiter.allow(self.key)


@dataclass(frozen=True)
class Workshop:
    planner: PathPlanner
    # Who the lessons are made for; a visitor with no record has none kept.
    caller: Caller
    budget: GenerationBudget
