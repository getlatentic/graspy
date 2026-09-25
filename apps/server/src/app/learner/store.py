"""Where each learner's record is kept: a Durable Object per learner on a
Worker, a dict locally. Both change it through record.changed."""

from __future__ import annotations

from typing import Any, Protocol

from .record import Change, LearnerRecord, changed, parsed, serialised

MEMORY_LEARNERS = 500


class LearnerStore(Protocol):
    async def load(self, learner: str) -> LearnerRecord: ...

    async def change(self, learner: str, change: Change) -> None: ...


class InMemoryLearnerStore:
    def __init__(self) -> None:
        self._stored: dict[str, str] = {}

    async def load(self, learner: str) -> LearnerRecord:
        return parsed(self._stored.get(learner))

    async def change(self, learner: str, change: Change) -> None:
        self._stored[learner] = changed(self._stored.get(learner), serialised(change))
        while len(self._stored) > MEMORY_LEARNERS:
            del self._stored[next(iter(self._stored))]


class DurableObjectLearnerStore:
    def __init__(self, namespace: Any) -> None:
        self._namespace = namespace

    async def load(self, learner: str) -> LearnerRecord:
        return parsed(await self._namespace.getByName(learner).load())

    async def change(self, learner: str, change: Change) -> None:
        await self._namespace.getByName(learner).change(serialised(change))
