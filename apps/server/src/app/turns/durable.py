"""A turn that is run by a host and read from the log."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from ..chatlog.log import ChatLog, Event
from .host import TurnHost
from .job import TurnJob
from .relay import follow


@dataclass(frozen=True)
class DurableTurns:
    host: TurnHost
    log: ChatLog

    async def run(self, job: TurnJob) -> AsyncIterator[Event]:
        """Starts the turn, or joins it if the chat holds it, and yields its events until it is
        finished. The turn goes on if the reader goes."""
        began = await self.host.start(job)
        async for event in follow(self.log, job.chat, job.turn, began):
            yield event
