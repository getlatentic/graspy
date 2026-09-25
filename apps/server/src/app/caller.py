from __future__ import annotations

from dataclasses import dataclass

from .agent.memory import ConversationStore
from .learner.record import Change, LearnerRecord
from .learner.store import LearnerStore
from .lessons.makers import LessonMaking
from .lessons.store import LessonStore


@dataclass(frozen=True)
class Keeping:
    learners: LearnerStore
    lessons: LessonStore
    making: LessonMaking
    conversations: ConversationStore


@dataclass(frozen=True)
class Caller:
    """Who a tool call or a turn acts for: the device its session names, if
    any. A session without a device keeps no record."""

    learner: str | None
    keeping: Keeping

    async def record(self) -> LearnerRecord:
        if not self.learner:
            return LearnerRecord()
        return await self.keeping.learners.load(self.learner)

    async def change(self, change: Change) -> None:
        if self.learner:
            await self.keeping.learners.change(self.learner, change)
