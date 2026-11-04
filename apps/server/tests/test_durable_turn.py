"""A turn run by a host and read from the log, driven through A2A as the browser drives it."""

import asyncio

import pytest
from fastapi import FastAPI
from test_a2a import KEEPING, SECRET, FakeTutor, settings, turn

from app.agent.a2a import FAILED_TURN, a2a_routes
from app.agent.streaming import AnswerDelta, AnswerRestart, ToolActivity
from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.security.guard import SessionMiddleware
from app.turns.durable import DurableTurns
from app.turns.host import TaskTurnHost, TutorTurnSource, begin_turn
from app.turns.job import TurnJob
from app.turns.rules import MAX_STALLED_RUNS


async def no_wait(_seconds: float) -> None:
    await asyncio.sleep(0)


class Flaky(FakeTutor):
    """Fails the first `failures` runs, then answers."""

    def __init__(self, failures: int, **kwargs):
        super().__init__(**kwargs)
        self.failures = failures

    async def stream(self, *args, **kwargs):
        if self.failures:
            self.failures -= 1
            raise RuntimeError("model unavailable")
        async for item in super().stream(*args, **kwargs):
            yield item


@pytest.fixture
def log():
    return ChatLog(LocalD1())


def durable_app(log: ChatLog, tutor) -> tuple[FastAPI, TaskTurnHost]:
    host = TaskTurnHost(log, TutorTurnSource(tutor, KEEPING), sleep=no_wait)
    app = FastAPI()
    app.routes.extend(a2a_routes(settings(), tutor, KEEPING, DurableTurns(host, log)))
    app.add_middleware(
        SessionMiddleware, prefixes=(settings().a2a_path_prefix,), secret=SECRET
    )
    return app, host


async def kinds_of(log: ChatLog, chat: str) -> list[str]:
    return [e.kind for e in await log.since(chat, 0, 500)]


async def test_a_durable_turn_streams_and_completes_from_the_log(log):
    tutor = FakeTutor(
        happenings=[
            ToolActivity("show_card"),
            AnswerDelta("Forty-"),
            AnswerDelta("two"),
        ]
    )
    app, host = durable_app(log, tutor)

    result = await turn(app, "What is 6 times 7?")
    await host.idle()

    assert result["states"][-1] == "COMPLETED"
    assert result["answer"] == "Forty-two"
    assert result["activities"] == ["show_card"]
    assert "".join(text for _, _, text in result["streamed"]) == "Forty-two"
    seen = await kinds_of(log, result["context"])
    assert seen[0] == kinds.TURN_STARTED and seen[-1] == kinds.TURN_FINISHED


async def test_a_run_that_fails_is_run_again_and_the_reply_is_kept_once(log):
    tutor = Flaky(failures=1, answer="Forty-two")
    app, host = durable_app(log, tutor)

    result = await turn(app, "What is 6 times 7?")
    await host.idle()

    assert result["states"][-1] == "COMPLETED"
    assert result["answer"] == "Forty-two"
    events = await log.since(result["context"], 0, 500)
    runs = [e for e in events if e.kind == kinds.TURN_RESUMED]
    aborted = [e for e in events if e.kind == kinds.ROUND_ABORTED]
    assert [e.data["run"] for e in runs] == [1, 2]
    assert [e.data["reason"] for e in aborted] == ["RuntimeError"]


async def test_a_turn_that_cannot_progress_fails_with_a_cause(log):
    tutor = Flaky(failures=100)
    app, host = durable_app(log, tutor)

    result = await turn(app, "What is 6 times 7?")
    await host.idle()

    assert result["states"][-1] == "FAILED"
    assert result["answer"] == FAILED_TURN
    finished = [
        e
        for e in await log.since(result["context"], 0, 500)
        if e.kind == kinds.TURN_FINISHED
    ]
    assert len(finished) == 1
    assert finished[0].data["status"] == "failed"
    assert finished[0].data["cause"]
    resumes = [
        e
        for e in await log.since(result["context"], 0, 500)
        if e.kind == kinds.TURN_RESUMED
    ]
    assert len(resumes) <= MAX_STALLED_RUNS + 1


async def test_a_rewritten_answer_is_withdrawn_in_the_task(log):
    tutor = FakeTutor(
        happenings=[AnswerDelta("Dr"), AnswerRestart(), AnswerDelta("Forty-two")]
    )
    app, host = durable_app(log, tutor)

    result = await turn(app, "What is 6 times 7?")
    await host.idle()

    texts = [text for _, _, text in result["streamed"]]
    assert "" in texts
    assert texts[-1] == "Forty-two"


async def test_starting_a_turn_twice_runs_it_once(log):
    tutor = FakeTutor(answer="Forty-two")
    host = TaskTurnHost(log, TutorTurnSource(tutor, KEEPING), sleep=no_wait)
    job = TurnJob(chat="c1", turn="t1", message="What is 6 times 7?")

    first = await host.start(job)
    second = await host.start(job)
    await host.idle()

    assert first == second
    assert len(tutor.calls) == 1
    again = await begin_turn(log, job, 5)
    assert again == first


async def test_a_turn_survives_the_reader_going(log):
    tutor = FakeTutor(answer="Forty-two")
    host = TaskTurnHost(log, TutorTurnSource(tutor, KEEPING), sleep=no_wait)
    turns = DurableTurns(host, log)
    job = TurnJob(chat="c2", turn="t1", message="What is 6 times 7?")

    reader = turns.run(job)
    await anext(reader)
    await reader.aclose()
    await host.idle()

    kinds_seen = await kinds_of(log, "c2")
    assert kinds_seen[-1] == kinds.TURN_FINISHED
    finished = (await log.since("c2", 0, 500))[-1]
    assert finished.data["reply"]["answer"] == "Forty-two"
