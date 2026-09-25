"""Where lessons are made: locally a task on the event loop; on a Worker,
where a request cannot outlive its response, a Durable Object's alarm."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from ..learner.time import now_ms
from .making import Job, Making, started
from .run import Save

Runner = Callable[[Job, Save], Awaitable[None]]
MEMORY_MAKINGS = 500


class LessonMaking(Protocol):
    async def start(self, key: str, job: Job) -> Making:
        """The lesson under ``key``, or a new one started from ``job``."""
        ...

    async def progress(self, key: str) -> Making | None: ...


def _parsed(stored: str | None) -> Making | None:
    return Making.model_validate_json(stored) if stored else None


class TaskLessonMaking:
    def __init__(self, runner: Runner) -> None:
        self._runner = runner
        self._stored: dict[str, str] = {}
        # asyncio keeps only weak references to tasks.
        self._running: set[asyncio.Task] = set()

    async def start(self, key: str, job: Job) -> Making:
        job_json = job.model_dump_json(by_alias=True)
        answer, run = started(self._stored.get(key), job_json, now_ms())
        self._stored[key] = answer
        while len(self._stored) > MEMORY_MAKINGS:
            del self._stored[next(iter(self._stored))]
        if run:
            task = asyncio.create_task(self._runner(job, self._saver(key)))
            self._running.add(task)
            task.add_done_callback(self._running.discard)
        return Making.model_validate_json(answer)

    async def progress(self, key: str) -> Making | None:
        return _parsed(self._stored.get(key))

    def _saver(self, key: str) -> Save:
        async def save(making: Making) -> None:
            self._stored[key] = making.model_dump_json(by_alias=True)

        return save


class DurableObjectLessonMaking:
    def __init__(self, namespace: Any) -> None:
        self._namespace = namespace

    async def start(self, key: str, job: Job) -> Making:
        answer = await self._namespace.getByName(key).start(
            job.model_dump_json(by_alias=True)
        )
        return Making.model_validate_json(answer)

    async def progress(self, key: str) -> Making | None:
        return _parsed(await self._namespace.getByName(key).progress())
