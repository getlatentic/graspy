"""What a turn can make, for tests: a planner that answers at once, and lessons made by a stand-in."""

from __future__ import annotations

from app.agent.cards import PathCard
from app.agent.memory import InMemoryConversationStore
from app.agent.toolkit import TurnOutputs
from app.agent.workshop import GenerationBudget, Workshop
from app.caller import Caller, Keeping
from app.domains.path.service import Revision
from app.learner.store import InMemoryLearnerStore
from app.lessons.makers import LessonMaking, TaskLessonMaking
from app.lessons.making import Job, Making
from app.lessons.run import Save
from app.lessons.store import InMemoryLessonStore
from app.local_d1 import LocalD1
from app.threads.store import ThreadStore


class FakePlanner:
    """Plans every goal as two steps, the second the goal; what it was asked is kept."""

    def __init__(self, failing: tuple[str, ...] = ()) -> None:
        self.asked: list[tuple[str, Revision | None]] = []
        self.failing = failing

    async def plan_path(
        self,
        country: str,
        language: str,
        grade_level: str,
        goal: str,
        revision: Revision | None = None,
    ) -> dict:
        self.asked.append((goal, revision))
        if goal in self.failing:
            raise RuntimeError("the model is down")
        return {
            "subject": goal.title(),
            "goal": goal,
            "steps": [
                {"title": f"{goal} basics", "level": "SS 1"},
                {"title": goal, "level": "SS 3"},
            ],
        }


class Limited:
    """A budget that allows this many spends."""

    def __init__(self, allowed: int) -> None:
        self.allowed = allowed
        self.keys: list[str] = []

    async def allow(self, key: str) -> bool:
        self.keys.append(key)
        self.allowed -= 1
        return self.allowed >= 0


def keeping(making: LessonMaking | None = None) -> Keeping:
    async def never(_job: Job, _save: Save) -> None:
        raise AssertionError("a lesson was made that the test did not expect")

    return Keeping(
        learners=InMemoryLearnerStore(),
        lessons=InMemoryLessonStore(),
        making=making or TaskLessonMaking(never),
        conversations=InMemoryConversationStore(),
        threads=ThreadStore(LocalD1()),
    )


def workshop(
    planner: FakePlanner | None = None,
    making: LessonMaking | None = None,
    learner: str | None = None,
    budget: GenerationBudget | None = None,
) -> Workshop:
    return Workshop(
        planner or FakePlanner(),
        Caller(learner, keeping(making)),
        budget or GenerationBudget(None, "source"),
    )


def paths_shown(outputs: TurnOutputs) -> list[PathCard]:
    return [card for card in outputs.cards if isinstance(card, PathCard)]


class ScriptedMaking:
    """A lesson maker whose lesson is in the given states one after another: the first answers the
    start, the next the asks for its progress, the last for ever after."""

    def __init__(self, *states: str) -> None:
        self.states = states
        self.started: list[Job] = []
        self.progressed = 0
        self._looked = 0

    def _next(self) -> Making:
        status = self.states[min(self._looked, len(self.states) - 1)]
        self._looked += 1
        return Making(
            status=status,  # type: ignore[arg-type]
            lesson_id="lesson-1" if status == "ready" else None,
            whole=status == "ready",
        )

    async def start(self, key: str, job: Job) -> Making:
        self.started.append(job)
        return self._next()

    async def progress(self, key: str) -> Making | None:
        self.progressed += 1
        return self._next()
