"""Where each learner's record and plan are kept: a Durable Object per learner
on a Worker, a dict locally. Both change the record through record.changed."""

from __future__ import annotations

from typing import Any, Protocol

from .record import Change, LearnerRecord, changed, parsed, serialised

MEMORY_LEARNERS = 500


class LearnerStore(Protocol):
    async def load(self, learner: str) -> LearnerRecord: ...

    async def change(self, learner: str, change: Change) -> None: ...

    async def plan(self, learner: str) -> str | None: ...

    async def keep_plan(self, learner: str, plan_json: str) -> None: ...


class InMemoryLearnerStore:
    def __init__(self) -> None:
        self._stored: dict[str, str] = {}
        self._plans: dict[str, str] = {}

    async def load(self, learner: str) -> LearnerRecord:
        return parsed(self._stored.get(learner))

    async def change(self, learner: str, change: Change) -> None:
        self._stored[learner] = changed(self._stored.get(learner), serialised(change))
        while len(self._stored) > MEMORY_LEARNERS:
            del self._stored[next(iter(self._stored))]

    async def plan(self, learner: str) -> str | None:
        return self._plans.get(learner)

    async def keep_plan(self, learner: str, plan_json: str) -> None:
        self._plans[learner] = plan_json
        while len(self._plans) > MEMORY_LEARNERS:
            del self._plans[next(iter(self._plans))]


class DurableObjectLearnerStore:
    def __init__(self, namespace: Any) -> None:
        self._namespace = namespace

    async def load(self, learner: str) -> LearnerRecord:
        return parsed(await self._namespace.getByName(learner).load())

    async def change(self, learner: str, change: Change) -> None:
        await self._namespace.getByName(learner).change(serialised(change))

    async def plan(self, learner: str) -> str | None:
        return await self._namespace.getByName(learner).plan() or None

    async def keep_plan(self, learner: str, plan_json: str) -> None:
        await self._namespace.getByName(learner).keep_plan(plan_json)
