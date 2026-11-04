"""Where a turn is run so that it outlives the request that began it: locally a task on the event loop;
on a Worker, where a request cannot outlive its response, a Durable Object's alarm."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from ..agent.tutor import Tutor
from ..caller import Keeping
from ..chatlog import kinds
from ..chatlog.log import ChatLog
from ..learner.time import now_ms
from .job import TurnJob, tutor_stream
from .runner import TurnRunner, TurnSource


class TurnHost(Protocol):
    async def start(self, job: TurnJob) -> int:
        """Accepts the turn, once for each turn id: a turn the chat already holds is joined, not
        started again. Returns the seq of its `turn.started` event, which is where a reader of
        the turn's events begins. The turn is run in the background whatever happens to the
        request that started it."""
        ...


class TutorTurnSource:
    """What the runner asks of the tutor: the turn of a job, as a stream of what it does."""

    def __init__(self, tutor: Tutor, keeping: Keeping) -> None:
        self._tutor = tutor
        self._keeping = keeping

    def stream(self, job: dict, turn: str):
        return tutor_stream(self._tutor, self._keeping, TurnJob.model_validate(job))


async def begin_turn(log: ChatLog, job: TurnJob, at: int) -> int:
    """Keeps the turn's first event, once, and says where it is. The job is in the event, so a run that
    begins after a restart has it. Raises ValueError for a job too long to keep."""
    data = {"turn": job.turn, "job": job.model_dump(mode="json")}
    await log.append_once(job.chat, kinds.TURN_STARTED, data, at)
    seq = await log.once_seq(job.chat, kinds.TURN_STARTED, job.turn)
    if seq is None:
        raise RuntimeError("A turn that was just started is not in its chat's log")
    return seq


class TaskTurnHost:
    """Runs a chat's turns in a task of this process, which a restart of the process ends. It is for
    a server that is not a Worker, and for tests: the same runner, without the alarm that finds a run
    the process lost."""

    def __init__(
        self,
        log: ChatLog,
        source: TurnSource,
        clock: Callable[[], int] = now_ms,
        repeatable: Callable[[str], bool] = lambda tool: True,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._log = log
        self._clock = clock
        self._sleep = sleep
        self._runner = TurnRunner(log, source, clock, self._no_alarm, repeatable)
        self._tasks: dict[str, asyncio.Task] = {}
        self._dirty: set[str] = set()

    @staticmethod
    async def _no_alarm(_at: int | None) -> None:
        return None

    async def start(self, job: TurnJob) -> int:
        seq = await begin_turn(self._log, job, self._clock())
        self._dirty.add(job.chat)
        if job.chat not in self._tasks:
            task = asyncio.create_task(self._drain(job.chat))
            self._tasks[job.chat] = task
        return seq

    async def _drain(self, chat: str) -> None:
        """Runs the chat's turns until none is left. A turn begun after the last look sets the chat dirty
        before the task ends, and nothing awaits between that look and the task's end."""
        try:
            while True:
                self._dirty.discard(chat)
                wait = await self._runner.advance(chat)
                if wait is None:
                    if chat in self._dirty:
                        continue
                    return
                await self._sleep(wait / 1000)
        finally:
            self._tasks.pop(chat, None)

    async def idle(self) -> None:
        """Returns when no chat has a turn running: for a test to wait on."""
        while self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)


class DurableObjectTurnHost:
    """One Durable Object a chat, whose alarm runs the chat's turns (apps/server/src/worker.py)."""

    def __init__(
        self, namespace: Any, log: ChatLog, clock: Callable[[], int] = now_ms
    ) -> None:
        self._namespace = namespace
        self._log = log
        self._clock = clock

    async def start(self, job: TurnJob) -> int:
        # The event is kept here, then the object is told: a turn the object never hears of is found
        # by no alarm, so the object also looks for turns the log holds that nothing is running.
        seq = await begin_turn(self._log, job, self._clock())
        await self._namespace.getByName(job.chat).wake(job.chat)
        return seq
