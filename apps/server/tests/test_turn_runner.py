"""The runner: one alarm's worth of a chat's turns, with a tutor that can be made to write, crash, hang
and fail, and a clock the test moves."""

import asyncio

import pytest

from app.agent.streaming import AnswerDelta, AnswerRestart, ToolActivity, ToolFinished
from app.agent.tutor import TutorReply
from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.turns import rules
from app.turns.rules import MAX_STALLED_RUNS, RETRY_AFTER_MS, WATCHDOG_MS
from app.turns.runner import TEXT_EVERY_MS, TurnRunner

JOB = {"chat": "c", "turn": "t1", "message": "Is it 7?"}
REPLY = TutorReply(answer="Yes.", follow_ups=[], actions=[], cards=[])


class Crash(BaseException):
    """The isolate dies: nothing after this point is written, and no handler of an error runs."""


class Clock:
    def __init__(self) -> None:
        self.now = 1_000_000

    def __call__(self) -> int:
        return self.now

    def after(self, ms: int) -> None:
        self.now += ms


class Script:
    """What the tutor does on each run of a turn: a list of items, ending in a `TutorReply`, with
    `Crash`, an exception, or `HANG` among them."""

    HANG = object()

    def __init__(self, *runs) -> None:
        self.runs = list(runs)
        self.called: list[tuple[dict, str]] = []
        self.stopped: list[tuple[str, str]] = []

    async def keep_stopped(self, job: dict, turn: str, answer: str) -> None:
        self.stopped.append((turn, answer))

    async def stream(self, job: dict, turn: str):
        self.called.append((job, turn))
        for item in self.runs.pop(0) if self.runs else [REPLY]:
            if item is Script.HANG:
                await asyncio.sleep(3600)
            elif isinstance(item, BaseException):
                raise item
            else:
                yield item


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def log():
    return ChatLog(LocalD1())


class Alarm:
    """What the runner asks the host to schedule."""

    def __init__(self) -> None:
        self.set: list[int | None] = []
        self.on_clear = None

    async def __call__(self, at: int | None) -> None:
        self.set.append(at)
        if at is None and self.on_clear:
            await self.on_clear()


@pytest.fixture
def alarm():
    return Alarm()


def runner_for(log, clock, alarm, script, **options) -> TurnRunner:
    return TurnRunner(log, script, clock, alarm, **options)


async def begin(log, clock, turn="t1", job=None) -> None:
    await log.append_once(
        "c",
        kinds.TURN_STARTED,
        {"turn": turn, "job": job or {**JOB, "turn": turn}},
        clock(),
    )


async def run_to_the_end(runner, clock, chat="c", gap=0) -> list[int | None]:
    waits = []
    while True:
        wait = await runner.advance(chat)
        waits.append(wait)
        if wait is None:
            return waits
        clock.after(max(wait, gap))


async def seen(log) -> list[tuple[str, dict]]:
    return [(event.kind, event.data) for event in await log.since("c", limit=500)]


def kinds_seen(events) -> list[str]:
    return [kind for kind, _ in events]


async def test_a_turn_is_run_and_finished_with_its_reply(log, clock, alarm):
    await begin(log, clock)
    script = Script(
        [
            AnswerDelta("Yes"),
            ToolActivity("calculate"),
            ToolFinished("calculate"),
            REPLY,
        ]
    )

    waits = await run_to_the_end(runner_for(log, clock, alarm, script), clock)

    events = await seen(log)
    assert waits == [0, None]
    assert kinds_seen(events) == [
        "turn.started",
        "turn.resumed",
        "text",
        "tool.started",
        "tool",
        "turn.finished",
    ]
    finished = events[-1][1]
    assert finished["status"] == "ok" and finished["reply"]["answer"] == "Yes."
    assert script.called == [(JOB, "t1")]


async def test_a_finished_turn_asks_for_nothing_more(log, clock, alarm):
    await begin(log, clock)
    runner = runner_for(log, clock, alarm, Script())
    await run_to_the_end(runner, clock)

    assert await runner.advance("c") is None
    assert alarm.set[-1] is None


async def test_a_watchdog_is_set_before_every_run(log, clock, alarm):
    await begin(log, clock)

    await run_to_the_end(runner_for(log, clock, alarm, Script()), clock)

    assert alarm.set[0] == clock.now + WATCHDOG_MS
    assert alarm.set[-1] is None


async def test_the_words_of_an_answer_are_kept_a_few_times_a_second_not_a_word_at_a_time(
    log, clock, alarm
):
    class Slow(Script):
        async def stream(self, job, turn):
            for n in range(10):
                yield AnswerDelta(f"w{n} ")
            clock.after(TEXT_EVERY_MS)
            yield AnswerDelta("w10 ")
            yield REPLY

    await begin(log, clock)
    await run_to_the_end(runner_for(log, clock, alarm, Slow()), clock)

    texts = [data["text"] for kind, data in await seen(log) if kind == "text"]
    assert "".join(texts) == "".join(f"w{n} " for n in range(11))
    assert len(texts) <= 3


async def test_an_answer_written_again_withdraws_what_was_kept(log, clock, alarm):
    await begin(log, clock)
    script = Script([AnswerDelta("Yes"), AnswerRestart(), AnswerDelta("No"), REPLY])

    await run_to_the_end(runner_for(log, clock, alarm, script), clock)

    events = await seen(log)
    assert "round.aborted" in kinds_seen(events)
    assert [data["reason"] for kind, data in events if kind == "round.aborted"] == [
        "rewritten"
    ]


async def test_a_run_cut_off_midway_is_run_again_and_its_words_are_withdrawn(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script([AnswerDelta("Ye"), Crash()], [AnswerDelta("Yes."), REPLY])
    runner = runner_for(log, clock, alarm, script)

    with pytest.raises(Crash):
        await runner.advance("c")
    clock.after(WATCHDOG_MS)
    waits = await run_to_the_end(runner, clock)

    events = await seen(log)
    assert waits == [0, None]
    assert kinds_seen(events) == [
        "turn.started",
        "turn.resumed",
        "text",
        "round.aborted",
        "turn.resumed",
        "text",
        "turn.finished",
    ]
    assert events[3][1] == {"turn": "t1", "run": 1, "reason": "cut_off"}
    assert events[4][1]["run"] == 2 and events[-1][1]["status"] == "ok"
    assert len(script.called) == 2


async def test_a_run_that_fails_is_run_again_after_a_short_wait(log, clock, alarm):
    await begin(log, clock)
    script = Script([RuntimeError("provider down")], [REPLY])
    runner = runner_for(log, clock, alarm, script)

    first = await runner.advance("c")
    clock.after(first)
    waits = [first, *await run_to_the_end(runner, clock)]

    assert waits == [RETRY_AFTER_MS, 0, None]
    aborted = [data for kind, data in await seen(log) if kind == "round.aborted"]
    assert aborted == [{"turn": "t1", "run": 1, "reason": "RuntimeError"}]


async def test_a_run_that_takes_longer_than_its_deadline_is_cut(
    log, clock, alarm, monkeypatch
):
    monkeypatch.setattr("app.turns.runner.RUN_DEADLINE_S", 0.05)
    await begin(log, clock)
    script = Script([Script.HANG], [REPLY])
    runner = runner_for(log, clock, alarm, script)

    first = await runner.advance("c")
    clock.after(first)
    await run_to_the_end(runner, clock)

    events = await seen(log)
    assert [data["reason"] for kind, data in events if kind == "round.aborted"] == [
        "deadline"
    ]
    assert events[-1][1]["status"] == "ok"


async def test_a_turn_whose_runs_keep_nothing_ends_as_failed_with_a_cause(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script(*([Crash()] for _ in range(MAX_STALLED_RUNS)))
    runner = runner_for(log, clock, alarm, script)

    for _ in range(MAX_STALLED_RUNS):
        with pytest.raises(Crash):
            await runner.advance("c")
        clock.after(WATCHDOG_MS)
    waits = await run_to_the_end(runner, clock)

    finished = (await seen(log))[-1]
    assert finished[0] == "turn.finished"
    assert (
        finished[1]["status"] == "failed" and finished[1]["cause"] == rules.NO_PROGRESS
    )
    assert waits == [0, None] and len(script.called) == MAX_STALLED_RUNS


async def test_a_run_that_made_progress_is_not_counted_against_the_turn(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script(
        *([AnswerDelta("a"), Crash()] for _ in range(MAX_STALLED_RUNS + 2)), [REPLY]
    )
    runner = runner_for(log, clock, alarm, script)

    for _ in range(MAX_STALLED_RUNS + 2):
        with pytest.raises(Crash):
            await runner.advance("c")
        clock.after(WATCHDOG_MS)
    await run_to_the_end(runner, clock)

    assert (await seen(log))[-1][1]["status"] == "ok"


async def test_a_turn_that_kept_nothing_for_five_minutes_ends_as_failed(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script([AnswerDelta("a"), Crash()], [REPLY])
    runner = runner_for(log, clock, alarm, script)
    with pytest.raises(Crash):
        await runner.advance("c")

    clock.after(rules.GIVE_UP_AFTER_MS + 1)
    await run_to_the_end(runner, clock)

    finished = (await seen(log))[-1][1]
    assert finished["status"] == "failed" and finished["cause"] == rules.STALLED
    assert len(script.called) == 1


async def test_a_run_cut_off_in_a_tool_that_must_not_be_sent_twice_ends_the_turn_unrun(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script([ToolActivity("pay"), Crash()], [REPLY])
    runner = runner_for(
        log, clock, alarm, script, repeatable=lambda tool: tool != "pay"
    )
    with pytest.raises(Crash):
        await runner.advance("c")

    clock.after(WATCHDOG_MS)
    await run_to_the_end(runner, clock)

    finished = (await seen(log))[-1][1]
    assert (
        finished["status"] == "failed" and finished["cause"] == rules.UNSAFE_TO_REPEAT
    )
    assert len(script.called) == 1


async def test_a_run_cut_off_in_a_tool_that_may_be_sent_again_is_run_again(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script([ToolActivity("calculate"), Crash()], [REPLY])
    runner = runner_for(log, clock, alarm, script, repeatable=lambda tool: True)
    with pytest.raises(Crash):
        await runner.advance("c")

    clock.after(WATCHDOG_MS)
    await run_to_the_end(runner, clock)

    assert (await seen(log))[-1][1]["status"] == "ok" and len(script.called) == 2


async def test_a_failure_says_what_went_wrong_for_the_app_to_show(log, clock, alarm):
    await begin(log, clock)
    script = Script(*([RuntimeError("provider down")] for _ in range(MAX_STALLED_RUNS)))

    await run_to_the_end(runner_for(log, clock, alarm, script), clock)

    finished = (await seen(log))[-1][1]
    assert finished["status"] == "failed"
    assert (
        finished["cause"] == rules.NO_PROGRESS and finished["detail"] == "RuntimeError"
    )


async def test_turns_of_one_chat_are_run_oldest_first(log, clock, alarm):
    await begin(log, clock, "t1")
    await begin(log, clock, "t2")
    script = Script([REPLY], [REPLY])

    await run_to_the_end(runner_for(log, clock, alarm, script), clock)

    assert [turn for _, turn in script.called] == ["t1", "t2"]
    finished = [
        data["turn"] for kind, data in await seen(log) if kind == "turn.finished"
    ]
    assert finished == ["t1", "t2"]


async def test_a_turn_begun_while_the_alarm_was_being_cleared_is_found(
    log, clock, alarm
):
    runner = runner_for(log, clock, alarm, Script())

    async def a_turn_begins():
        alarm.on_clear = None
        await begin(log, clock)

    alarm.on_clear = a_turn_begins
    waits = await run_to_the_end(runner, clock)

    assert waits == [0, None]
    assert (await seen(log))[-1][1]["status"] == "ok"


async def test_a_chat_with_no_turn_has_nothing_to_do(log, clock, alarm):
    assert await runner_for(log, clock, alarm, Script()).advance("empty") is None


async def test_the_turns_of_other_chats_are_not_touched(log, clock, alarm):
    await begin(log, clock)
    await log.append_once("d", kinds.TURN_STARTED, {"turn": "t1", "job": JOB}, clock())

    await run_to_the_end(runner_for(log, clock, alarm, Script()), clock, chat="c")

    assert [event.kind for event in await log.since("d")] == ["turn.started"]


async def until(log, kind: str, count: int = 1) -> None:
    """Returns when the log holds `count` events of `kind`."""
    for _ in range(1000):
        if (
            sum(1 for event in await log.since("c", limit=500) if event.kind == kind)
            >= count
        ):
            return
        await asyncio.sleep(0)
    raise AssertionError(f"The log never held {count} {kind}")


async def test_a_turn_stopped_while_it_runs_ends_with_the_words_it_has(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script([AnswerDelta("Forty"), ToolActivity("calculate"), Script.HANG])
    runner = runner_for(log, clock, alarm, script)
    running = asyncio.create_task(runner.advance("c"))
    await until(log, kinds.TOOL_STARTED)

    await runner.stop("c", "t1")

    assert await running == 0
    assert await runner.advance("c") == 0
    events = await seen(log)
    assert kinds_seen(events)[-4:] == [
        "tool.started",
        "turn.stop",
        "tool.cancelled",
        "turn.finished",
    ]
    assert events[-2][1] == {"turn": "t1", "tool": "calculate"}
    finished = events[-1][1]
    assert finished["status"] == "stopped" and finished["reply"]["answer"] == "Forty"
    assert script.stopped == [("t1", "Forty")]
    assert await runner.advance("c") is None


async def test_the_words_not_yet_kept_when_the_learner_stops_are_kept(
    log, clock, alarm
):
    """Words are kept every TEXT_EVERY_MS; those after the last time are kept by the stop."""
    await begin(log, clock)
    script = Script([AnswerDelta("Forty"), AnswerDelta("-two"), Script.HANG])
    runner = runner_for(log, clock, alarm, script)
    running = asyncio.create_task(runner.advance("c"))
    await until(log, kinds.TEXT)

    await runner.stop("c", "t1")
    await running
    await runner.advance("c")

    assert script.stopped == [("t1", "Forty-two")]


async def test_a_turn_stopped_before_its_run_begins_ends_without_running(
    log, clock, alarm
):
    await begin(log, clock)
    script = Script()
    runner = runner_for(log, clock, alarm, script)

    await runner.stop("c", "t1")

    assert alarm.set == [clock()]
    assert await runner.advance("c") == 0
    finished = (await seen(log))[-1][1]
    assert finished["status"] == "stopped" and finished["reply"]["answer"] == ""
    assert script.called == [] and script.stopped == []


async def test_a_stop_after_the_end_of_a_turn_changes_nothing(log, clock, alarm):
    await begin(log, clock)
    runner = runner_for(log, clock, alarm, Script())
    await run_to_the_end(runner, clock)
    before = await seen(log)

    await runner.stop("c", "t1")

    assert await seen(log) == before


async def test_a_stop_is_found_after_a_restart(log, clock, alarm):
    """The stop is in the log: a runner that never heard of it ends the turn."""
    await begin(log, clock)
    first = runner_for(log, clock, alarm, Script())
    await first.stop("c", "t1")
    script = Script()

    await run_to_the_end(runner_for(log, clock, alarm, script), clock)

    assert (await seen(log))[-1][1]["status"] == "stopped" and script.called == []


async def test_every_event_a_run_keeps_is_announced(log, clock, alarm):
    await begin(log, clock)
    told = []

    async def announce() -> None:
        told.append(len(await log.since("c", limit=500)))

    runner = runner_for(
        log, clock, alarm, Script([AnswerDelta("Yes"), REPLY]), announce=announce
    )
    await run_to_the_end(runner, clock)

    # resumed, text, finished: each announced after it was kept.
    assert told == [2, 3, 4]


async def test_a_stop_that_comes_before_the_run_is_registered_still_ends_the_run(
    log, clock, alarm
):
    """The stop arrives while the run's first event is being announced, before the run exists."""
    await begin(log, clock)
    script = Script([REPLY])
    stopped = []

    async def announce() -> None:
        if not stopped:
            stopped.append(True)
            await runner.stop("c", "t1")

    runner = runner_for(log, clock, alarm, script, announce=announce)

    assert await runner.advance("c") == 0
    assert await runner.advance("c") == 0

    finished = (await seen(log))[-1][1]
    assert finished["status"] == "stopped"
    assert script.called == []
