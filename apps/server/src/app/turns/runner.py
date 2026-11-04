"""One alarm's worth of a chat's turns: find the turn that is not finished, decide whether to run it
or give up on it, run it with a deadline, and write what happens to the chat's log.

Everything the runner reads of a turn is in the log, so a run that begins after the isolate was
restarted knows what the run before it did. A run keeps what it writes of the answer, and if it
is cut off the next run withdraws it (`round.aborted`) and writes the answer again: the exchange
is kept once whatever the number of runs, because the log keeps an exchange once per turn."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, Protocol

from ..agent.streaming import AnswerDelta, AnswerRestart, ToolActivity, ToolFinished
from ..agent.tutor import TutorReply
from ..chatlog import kinds
from ..chatlog.log import PAGE, ChatLog
from .fold import FOLDED, TurnState, folded
from .job import reply_payload, words_payload
from .rules import (
    RETRY_AFTER_MS,
    RUN_DEADLINE_S,
    WATCHDOG_MS,
    GiveUp,
    Stop,
    next_step,
)

logger = logging.getLogger(__name__)

# The words of an answer are kept as events this often, not one for every word.
TEXT_EVERY_MS = 150
# The turns of one chat that are looked at: one that is older and not finished has been given up on.
RECENT_TURNS = 100


class TurnSource(Protocol):
    def stream(self, job: dict, turn: str) -> AsyncIterator[Any]:
        """What the tutor does for the turn, as `AnswerDelta`, `AnswerRestart`, `ToolActivity`,
        `ToolFinished` and, last, the `TutorReply`."""
        ...

    async def keep_stopped(self, job: dict, turn: str, answer: str) -> None:
        """Keeps the exchange of a turn the learner stopped, with the words it had written."""
        ...


Schedule = Callable[[int | None], Awaitable[None]]
# Told after every event the runner keeps, so what is waiting on the chat reads it.
Announce = Callable[[], Awaitable[None]]


async def _nothing() -> None:
    return None


class TurnRunner:
    def __init__(
        self,
        log: ChatLog,
        source: TurnSource,
        clock: Callable[[], int],
        schedule: Schedule,
        repeatable: Callable[[str], bool] = lambda tool: True,
        announce: Announce = _nothing,
    ) -> None:
        self._log = log
        self._source = source
        self._clock = clock
        self._schedule = schedule
        self._repeatable = repeatable
        self._announce = announce
        # The turn whose run is going and the task that is running it.
        self._running: tuple[str, asyncio.Task] | None = None
        self._interrupted: str | None = None
        # Turns stopped while this runner lives, which a run about to begin must not start.
        self._stopped_turns: set[str] = set()

    async def stop(self, chat: str, turn: str) -> None:
        """The learner stopped `turn`. The stop is kept, so a restart finds it, and the run that is
        writing the turn ends now; the next `advance` ends the turn with the words it has."""
        if await self._log.once_seq(chat, kinds.TURN_FINISHED, turn) is not None:
            return
        await self._append(chat, kinds.TURN_STOP, {"turn": turn})
        self._stopped_turns.add(turn)
        if self._running and self._running[0] == turn:
            self._interrupted = turn
            self._running[1].cancel()
        else:
            await self._schedule(self._clock())

    async def advance(self, chat: str) -> int | None:
        """Does the next thing a chat's oldest unfinished turn needs. Returns the milliseconds to wait
        before calling again, or None when no turn of the chat is unfinished."""
        state = await self._oldest_unfinished(chat)
        if state is None:
            await self._schedule(None)
            # A turn begun while the alarm was being cleared set its own alarm before this read
            # or after the clear, so it is found here or its alarm stands.
            state = await self._oldest_unfinished(chat)
        if state is None:
            return None
        step = next_step(state, self._clock(), self._repeatable)
        if isinstance(step, Stop):
            await self._stopped(chat, state)
            return 0
        if isinstance(step, GiveUp):
            await self._finish(
                chat, state, "failed", cause=step.cause, detail=state.last_cause
            )
            return 0
        # Set before the run, so a run that dies is found.
        await self._schedule(self._clock() + WATCHDOG_MS)
        run = state.runs + 1
        if state.text_open:
            # The run before this one was cut off with words of the answer kept: withdrawn.
            await self._aborted(chat, state, state.runs, "cut_off")
        await self._append(chat, kinds.TURN_RESUMED, {"turn": state.turn, "run": run})
        task = asyncio.ensure_future(self._run(chat, state, run))
        self._running = (state.turn, task)
        if state.turn in self._stopped_turns:
            self._interrupted = state.turn
            task.cancel()
        try:
            async with asyncio.timeout(RUN_DEADLINE_S):
                reply = await task
        except TimeoutError:
            await self._aborted(chat, state, run, "deadline")
            return RETRY_AFTER_MS
        except asyncio.CancelledError:
            if self._interrupted != state.turn:
                raise
            self._interrupted = None
            return 0
        except Exception as error:
            logger.exception("Run %s of turn %s failed", run, state.turn)
            await self._aborted(chat, state, run, type(error).__name__)
            return RETRY_AFTER_MS
        finally:
            self._running = None
        await self._finish(chat, state, "ok", reply=reply_payload(reply))
        return 0

    async def _stopped(self, chat: str, state: TurnState) -> None:
        for tool in state.open_tools:
            await self._append(
                chat, kinds.TOOL_CANCELLED, {"turn": state.turn, "tool": tool}
            )
        answer = state.answer.strip()
        if answer:
            await self._source.keep_stopped(state.job, state.turn, answer)
        await self._finish(chat, state, "stopped", reply=words_payload(answer))

    async def _oldest_unfinished(self, chat: str) -> TurnState | None:
        marks = await self._log.recent(
            chat, (kinds.TURN_STARTED, kinds.TURN_FINISHED), 0, RECENT_TURNS
        )
        finished = {e.data.get("turn") for e in marks if e.kind == kinds.TURN_FINISHED}
        open_ = [
            e
            for e in marks
            if e.kind == kinds.TURN_STARTED and e.data.get("turn") not in finished
        ]
        if not open_:
            return None
        first = open_[0]
        events, after = [], first.seq - 1
        while True:
            page = await self._log.since(chat, after, PAGE, FOLDED)
            events += page
            if len(page) < PAGE:
                break
            after = page[-1].seq
        return folded(events).get(first.data["turn"])

    async def _run(self, chat: str, state: TurnState, run: int) -> TutorReply:
        reply: TutorReply | None = None
        buffered, last = "", 0

        async def keep(kind: str, **data: Any) -> None:
            await self._append(chat, kind, {"turn": state.turn, "run": run, **data})

        async def flush() -> None:
            nonlocal buffered, last
            words, buffered = buffered, ""
            last = self._clock()
            if words:
                await keep(kinds.TEXT, text=words)

        try:
            async for item in self._source.stream(state.job, state.turn):
                if isinstance(item, AnswerDelta):
                    buffered += item.text
                    if self._clock() - last >= TEXT_EVERY_MS:
                        await flush()
                elif isinstance(item, AnswerRestart):
                    buffered = ""
                    await keep(kinds.ROUND_ABORTED, reason="rewritten")
                elif isinstance(item, ToolActivity):
                    await flush()
                    await keep(kinds.TOOL_STARTED, tool=item.tool)
                elif isinstance(item, ToolFinished):
                    await keep(kinds.TOOL, tool=item.tool)
                else:
                    reply = item
        except asyncio.CancelledError:
            # The learner's stop: the words the learner saw are kept.
            await flush()
            raise
        await flush()
        if reply is None:
            raise RuntimeError("The turn ended without a reply")
        return reply

    async def _aborted(
        self, chat: str, state: TurnState, run: int, reason: str
    ) -> None:
        await self._append(
            chat,
            kinds.ROUND_ABORTED,
            {"turn": state.turn, "run": run, "reason": reason},
        )

    async def _finish(
        self, chat: str, state: TurnState, status: str, **data: Any
    ) -> None:
        await self._log.append_once(
            chat,
            kinds.TURN_FINISHED,
            {"turn": state.turn, "status": status, **data},
            self._clock(),
        )
        await self._announce()

    async def _append(self, chat: str, kind: str, data: dict[str, Any]) -> None:
        await self._log.append(chat, kind, data, self._clock())
        await self._announce()
