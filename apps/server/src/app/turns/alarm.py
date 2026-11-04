"""What a chat's Durable Object does when it is told of a turn and when its alarm rings.

The object holds the chat's id and nothing of the turn: the turn is in the chat's log. The alarm is
the only thing that runs a turn, and it is always set while a turn is unfinished: before each run
it is set to the watchdog time, so an isolate that dies mid-run is woken to resume it."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from typing import Any, Protocol

from ..learner.time import now_ms
from .runner import Schedule, TurnRunner

CHAT_KEY = "chat"


class Storage(Protocol):
    async def get(self, key: str) -> Any: ...
    async def put(self, key: str, value: Any) -> None: ...
    async def getAlarm(self) -> int | None: ...
    async def setAlarm(self, at: int) -> None: ...
    async def deleteAlarm(self) -> None: ...


# Builds the runner an alarm uses, given the `schedule` that sets and clears this object's alarm.
RunnerFor = Callable[[Schedule], TurnRunner]


class ChatTurnAlarm:
    def __init__(
        self,
        storage: Storage,
        runner_for: RunnerFor,
        clock: Callable[[], int] = now_ms,
        model: Callable[[], AbstractContextManager] = nullcontext,
    ) -> None:
        self._storage = storage
        self._runner_for = runner_for
        self._clock = clock
        self._model = model

    async def wake(self, chat: str) -> None:
        """A turn was begun in `chat`: the alarm rings now, unless it is already due."""
        await self._storage.put(CHAT_KEY, chat)
        now = self._clock()
        due = await self._storage.getAlarm()
        if due is None or due > now:
            await self._storage.setAlarm(now)

    async def schedule(self, at: int | None) -> None:
        if at is None:
            await self._storage.deleteAlarm()
        else:
            await self._storage.setAlarm(at)

    async def alarm(self) -> None:
        """Runs the chat's turns until none needs doing now. A turn to retry later has the alarm set
        to its time; one with nothing left to do has the alarm cleared."""
        chat = await self._storage.get(CHAT_KEY)
        if not chat:
            return
        runner = self._runner_for(self.schedule)
        with self._model():
            while True:
                wait = await runner.advance(chat)
                if wait is None:
                    return
                if wait > 0:
                    await self._storage.setAlarm(self._clock() + wait)
                    return
