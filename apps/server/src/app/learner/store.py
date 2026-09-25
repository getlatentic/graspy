"""Where each learner's record and plan are kept, and each account's list of
learners: a Durable Object per learner and per account on a Worker, dicts
locally. Both change the record through record.changed."""

from __future__ import annotations

import json
from typing import Any, Protocol

from ..account.directory import (
    Directory,
    DirectoryChange,
    directory_changed,
    parsed_directory,
    serialised_change,
)
from .record import Change, LearnerRecord, changed, parsed, serialised

MEMORY_LEARNERS = 500


class LearnerStore(Protocol):
    async def load(self, learner: str) -> LearnerRecord: ...

    async def change(self, learner: str, change: Change) -> None: ...

    async def plan(self, learner: str) -> str | None: ...

    async def keep_plan(self, learner: str, plan_json: str) -> None: ...

    async def forget(self, learner: str) -> None:
        """The record and the plan; an account's directory stays."""

    async def move(self, learner: str, to: str) -> None:
        """The record and the plan, to a learner who has neither."""

    async def directory(self, account: str) -> Directory: ...

    async def change_directory(self, account: str, change: DirectoryChange) -> None: ...


def _dropped_oldest(kept: dict[str, str]) -> None:
    while len(kept) > MEMORY_LEARNERS:
        del kept[next(iter(kept))]


class InMemoryLearnerStore:
    def __init__(self) -> None:
        self._stored: dict[str, str] = {}
        self._plans: dict[str, str] = {}
        self._directories: dict[str, str] = {}

    async def load(self, learner: str) -> LearnerRecord:
        return parsed(self._stored.get(learner))

    async def change(self, learner: str, change: Change) -> None:
        self._stored[learner] = changed(self._stored.get(learner), serialised(change))
        _dropped_oldest(self._stored)

    async def plan(self, learner: str) -> str | None:
        return self._plans.get(learner)

    async def keep_plan(self, learner: str, plan_json: str) -> None:
        self._plans[learner] = plan_json
        _dropped_oldest(self._plans)

    async def forget(self, learner: str) -> None:
        self._stored.pop(learner, None)
        self._plans.pop(learner, None)

    async def move(self, learner: str, to: str) -> None:
        for kept in (self._stored, self._plans):
            if learner in kept:
                kept[to] = kept.pop(learner)

    async def directory(self, account: str) -> Directory:
        return parsed_directory(self._directories.get(account))

    async def change_directory(self, account: str, change: DirectoryChange) -> None:
        self._directories[account] = directory_changed(
            self._directories.get(account), serialised_change(change)
        )
        _dropped_oldest(self._directories)


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

    async def forget(self, learner: str) -> None:
        await self._namespace.getByName(learner).forget()

    async def move(self, learner: str, to: str) -> None:
        kept = json.loads(await self._namespace.getByName(learner).export())
        await self._namespace.getByName(to).restore(kept["record"], kept["plan"])
        await self.forget(learner)

    async def directory(self, account: str) -> Directory:
        return parsed_directory(await self._namespace.getByName(account).directory())

    async def change_directory(self, account: str, change: DirectoryChange) -> None:
        await self._namespace.getByName(account).change_directory(
            serialised_change(change)
        )
