"""A turn started, read and stopped over REST, with a tutor that can be made to write and to hang."""

import asyncio
import json

import httpx
import pytest
from test_a2a import KEEPING, FakeTutor

from app.agent.streaming import AnswerDelta, ToolActivity
from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.factory import create_app
from app.local_d1 import LocalD1
from app.security.session import issue
from app.settings import Settings
from app.turns.durable import DurableTurns
from app.turns.host import TaskTurnHost, TutorTurnSource

SECRET = "chat-routes-secret"
CHAT = "5b3f3a52-1c1e-4e0e-9f0e-2f5d6c9a7b11"
TURN = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
BASE = "http://test"


def bearer(learner: str | None = "dev1") -> dict:
    return {"Authorization": f"Bearer {issue(SECRET, learner=learner).token}"}


class Hanging(FakeTutor):
    """Writes some words, calls a tool, then waits for ever."""

    async def stream(self, *args, **kwargs):
        yield AnswerDelta("Forty")
        yield ToolActivity("calculate")
        await asyncio.sleep(3600)
        yield  # pragma: no cover


@pytest.fixture
def log():
    return ChatLog(LocalD1())


def client_for(log, tutor) -> tuple[httpx.AsyncClient, TaskTurnHost]:
    host = TaskTurnHost(log, TutorTurnSource(tutor, KEEPING))
    app = create_app(
        Settings(
            public_base_url=BASE,
            aws_bearer_token_bedrock="b",
            session_secret=SECRET,
            _env_file=None,
        ),
        turns=DurableTurns(host, log),
    )
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url=BASE), host


def start_body(turn=TURN, text="What is 6 times 7?") -> dict:
    return {"turn": turn, "parts": [{"text": text}], "metadata": {}}


def frames_in(body: str) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


async def test_a_turn_is_started_and_its_frames_read_to_the_end(log):
    http, host = client_for(log, FakeTutor(happenings=[AnswerDelta("Forty-two")]))

    started = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer()
    )
    events = await http.get(
        f"/api/chats/{CHAT}/turns/{TURN}/events",
        params={"after": started.json()["cursor"]},
        headers=bearer(),
    )
    await host.idle()

    assert started.status_code == 200 and started.json()["turn"] == TURN
    frames = frames_in(events.text)
    assert [f["kind"] for f in frames] == ["turn.resumed", "text", "turn.finished"]
    assert frames[-1]["status"] == "ok" and frames[-1]["reply"]["answer"] == "Forty-two"
    assert events.headers["content-type"].startswith("text/event-stream")
    assert events.text.splitlines()[0] == ": open"
    assert f"id: {frames[-1]['seq']}" in events.text


async def test_the_same_turn_sent_again_is_one_turn(log):
    http, host = client_for(log, FakeTutor())

    first = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer()
    )
    second = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer()
    )
    await host.idle()

    assert first.json() == second.json()
    started = [e for e in await log.since(CHAT, 0, 100) if e.kind == kinds.TURN_STARTED]
    assert len(started) == 1


async def test_last_event_id_is_the_cursor_of_a_reconnecting_reader(log):
    http, host = client_for(log, FakeTutor(happenings=[AnswerDelta("Forty-two")]))
    started = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer()
    )
    await host.idle()
    whole = frames_in(
        (
            await http.get(
                f"/api/chats/{CHAT}/turns/{TURN}/events",
                params={"after": started.json()["cursor"]},
                headers=bearer(),
            )
        ).text
    )

    rest = await http.get(
        f"/api/chats/{CHAT}/turns/{TURN}/events",
        headers={**bearer(), "Last-Event-ID": str(whole[0]["seq"])},
    )

    assert [f["seq"] for f in frames_in(rest.text)] == [f["seq"] for f in whole[1:]]


async def test_a_cursor_beyond_the_chat_is_answered_with_a_reset(log):
    http, host = client_for(log, FakeTutor())
    await http.post(f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer())
    await host.idle()

    events = await http.get(
        f"/api/chats/{CHAT}/turns/{TURN}/events",
        params={"after": 999},
        headers=bearer(),
    )

    assert frames_in(events.text) == [{"kind": "reset"}]


async def test_a_turn_stopped_ends_with_the_words_it_has(log):
    http, host = client_for(log, Hanging())
    started = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer()
    )
    for _ in range(1000):
        if any(e.kind == kinds.TOOL_STARTED for e in await log.since(CHAT, 0, 100)):
            break
        await asyncio.sleep(0)

    stopped = await http.post(f"/api/chats/{CHAT}/turns/{TURN}/stop", headers=bearer())
    await host.idle()
    events = await http.get(
        f"/api/chats/{CHAT}/turns/{TURN}/events",
        params={"after": started.json()["cursor"]},
        headers=bearer(),
    )

    assert stopped.status_code == 204
    frames = frames_in(events.text)
    assert [f["kind"] for f in frames][-2:] == ["tool.cancelled", "turn.finished"]
    assert (
        frames[-1]["status"] == "stopped" and frames[-1]["reply"]["answer"] == "Forty"
    )


async def test_another_learner_is_told_the_chat_does_not_exist(log):
    http, host = client_for(log, FakeTutor())
    await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer("dev1")
    )
    await host.idle()
    other = bearer("dev2")

    start = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body("t0000002"), headers=other
    )
    read = await http.get(f"/api/chats/{CHAT}/turns/{TURN}/events", headers=other)
    stop = await http.post(f"/api/chats/{CHAT}/turns/{TURN}/stop", headers=other)
    missing = await http.get(
        "/api/chats/c0000000000/turns/t0000000000/events", headers=other
    )

    assert [r.status_code for r in (start, read, stop, missing)] == [404] * 4
    assert read.json() == missing.json()


async def test_a_session_is_required(log):
    http, _ = client_for(log, FakeTutor())

    response = await http.post(f"/api/chats/{CHAT}/turns", json=start_body())

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"turn": TURN, "parts": [{"text": "  "}]}, "empty_message"),
        ({"turn": TURN, "parts": [{"text": "x" * 2001}]}, "message_too_long"),
    ],
)
async def test_a_message_that_cannot_be_answered_is_refused_before_a_turn_begins(
    log, body, code
):
    http, _ = client_for(log, FakeTutor())

    response = await http.post(f"/api/chats/{CHAT}/turns", json=body, headers=bearer())

    assert response.status_code == 422 and response.json()["detail"]["code"] == code
    assert await log.since(CHAT, 0, 10) == []


async def test_ids_that_are_not_ids_are_refused(log):
    http, _ = client_for(log, FakeTutor())

    response = await http.post(
        "/api/chats/a%20b/turns", json=start_body(), headers=bearer()
    )

    assert response.status_code == 422


async def test_a_server_that_keeps_no_turns_says_so():
    app = create_app(
        Settings(aws_bearer_token_bedrock="b", session_secret=SECRET, _env_file=None)
    )
    http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE)

    response = await http.post(
        f"/api/chats/{CHAT}/turns", json=start_body(), headers=bearer()
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "turns_unavailable"


async def test_a_turn_too_large_to_keep_is_refused_not_a_server_error(log):
    http, _ = client_for(log, FakeTutor())
    body = {**start_body(), "metadata": {"learner": {"topic": "x" * 300_000}}}

    response = await http.post(f"/api/chats/{CHAT}/turns", json=body, headers=bearer())

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "turn_too_large"
