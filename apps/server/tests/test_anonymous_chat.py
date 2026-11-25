"""The tutor chat for a visitor with no account (the web's /try): its turns keep no learner record,
are counted per session, per network and in all, and are refused past a limit. A signed-in
learner's turns are not counted."""

import httpx
import pytest
from test_a2a import KEEPING, FakeTutor
from test_chat_routes import CHAT, SECRET, bearer, start_body

from app.api import anonymous_chat
from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.factory import create_app
from app.local_d1 import LocalD1
from app.security.session import issue
from app.settings import Settings
from app.turns.durable import DurableTurns
from app.turns.host import TaskTurnHost, TutorTurnSource

BASE = "http://test"
DEVICE = "anon-visitor-device-0001"
FRIENDLY = "Try again later, or sign in to keep going"


class Visit:
    """The app with a fake tutor, and what an anonymous visitor does with it."""

    def __init__(self) -> None:
        self.log = ChatLog(LocalD1())
        self.host = TaskTurnHost(self.log, TutorTurnSource(FakeTutor(), KEEPING))
        self.app = create_app(
            Settings(
                public_base_url=BASE,
                aws_bearer_token_bedrock="b",
                session_secret=SECRET,
                _env_file=None,
            ),
            turns=DurableTurns(self.host, self.log),
        )
        self.http = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url=BASE
        )

    async def session(self, **claims) -> dict:
        return {"Authorization": f"Bearer {issue(SECRET, **claims).token}"}

    async def take_turn(
        self, headers: dict, n: int = 0, chat: str = CHAT, ip=""
    ) -> int:
        sent = {**headers, **({"CF-Connecting-IP": ip} if ip else {})}
        answer = await self.http.post(
            f"/api/chats/{chat}/turns",
            json=start_body(turn=f"turn-{n:04d}-xx"),
            headers=sent,
        )
        await self.host.idle()
        return answer.status_code

    async def rows(self) -> dict[str, int]:
        found = await self.app.state.tv_db.prepare(
            "SELECT bucket, turns FROM anonymous_chat_use"
        ).all()
        return {row["bucket"]: row["turns"] for row in found["results"]}


@pytest.fixture
def visit():
    return Visit()


# What is kept


async def test_an_anonymous_turn_keeps_no_learner_record_though_the_session_names_a_device(
    visit,
):
    headers = await visit.session(learner=DEVICE)

    assert await visit.take_turn(headers) == 200

    started = await visit.log.since(CHAT, 0, 1, (kinds.TURN_STARTED,))
    assert started[0].data["job"]["learner"] is None
    assert (await KEEPING.learners.load(DEVICE)).conversations == []


async def test_a_signed_in_learner_cannot_read_or_join_an_anonymous_chat(visit):
    assert await visit.take_turn(await visit.session()) == 200

    read = await visit.http.get(
        f"/api/chats/{CHAT}/turns/turn-0000-xx/events", headers=bearer()
    )
    joined = await visit.take_turn(bearer(), n=1)

    assert (read.status_code, joined) == (404, 404)


# The limits


async def test_a_session_is_refused_past_its_limit_in_friendly_words(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "SESSION_TURNS", 2)
    headers = await visit.session()

    codes = [await visit.take_turn(headers, n) for n in range(3)]
    refused = await visit.http.post(
        f"/api/chats/{CHAT}/turns",
        json=start_body(turn="turn-0009-xx"),
        headers=headers,
    )

    assert codes == [200, 200, 429]
    assert refused.json()["detail"] == {"error": FRIENDLY, "code": "try_limit"}


async def test_a_network_is_refused_past_its_hour_whichever_session_it_uses(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 2)
    sessions = [await visit.session() for _ in range(3)]

    here = [
        await visit.take_turn(s, n, chat=f"chat-here-{n:04d}", ip="198.51.100.7")
        for n, s in enumerate(sessions)
    ]
    elsewhere = await visit.take_turn(
        await visit.session(), 9, chat="chat-else-0009", ip="198.51.100.8"
    )

    assert here == [200, 200, 429]
    assert elsewhere == 200


async def test_a_network_is_refused_past_its_day(visit, monkeypatch):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_DAY", 1)

    first = await visit.take_turn(await visit.session(), 0, chat="chat-one-0000")
    second = await visit.take_turn(await visit.session(), 1, chat="chat-two-0001")

    assert (first, second) == (200, 429)


async def test_all_anonymous_visitors_together_are_refused_past_the_day(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 2)

    codes = [
        await visit.take_turn(
            await visit.session(), n, chat=f"chat-{n:04d}-all", ip=f"198.51.100.{n}"
        )
        for n in range(3)
    ]

    assert codes == [200, 200, 429]


async def test_a_turn_over_a_narrow_limit_is_not_added_to_the_wider_counts(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "SESSION_TURNS", 1)
    headers = await visit.session()

    await visit.take_turn(headers, 0)
    await visit.take_turn(headers, 1)

    wide = {
        k: v for k, v in (await visit.rows()).items() if not k.startswith("session:")
    }
    assert set(wide.values()) == {1}


async def test_a_signed_in_learner_is_not_limited_and_is_not_counted(
    visit, monkeypatch
):
    for name in (
        "SESSION_TURNS",
        "NETWORK_TURNS_PER_HOUR",
        "NETWORK_TURNS_PER_DAY",
        "TURNS_PER_DAY",
    ):
        monkeypatch.setattr(anonymous_chat, name, 1)

    codes = [await visit.take_turn(bearer(), n) for n in range(3)]

    assert codes == [200, 200, 200]
    assert await visit.rows() == {}


async def test_counts_of_a_window_that_is_over_are_forgotten(visit):
    database = visit.app.state.tv_db
    await database.prepare(
        "INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES ('old', 9, 1)"
    ).run()

    await visit.take_turn(await visit.session())

    assert "old" not in await visit.rows()


async def test_a_turn_that_cannot_be_counted_is_refused_not_served(visit):
    class Broken:
        def prepare(self, _sql):
            raise RuntimeError("D1 is down")

    visit.app.state.tv_db = Broken()

    refused = await visit.http.post(
        f"/api/chats/{CHAT}/turns",
        json=start_body(),
        headers=await visit.session(),
    )

    assert refused.status_code == 503
    assert refused.json()["detail"]["code"] == "try_unavailable"


# A2A, the way in when the server keeps no turns


async def test_the_a2a_chat_of_a_visitor_is_limited_too_and_reading_is_not_counted(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "SESSION_TURNS", 1)
    headers = await visit.session()

    await visit.http.get("/.well-known/agent-card.json", headers=headers)
    first = await visit.http.post("/a2a", json={}, headers=headers)
    second = await visit.http.post("/a2a", json={}, headers=headers)

    assert first.status_code != 429
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "try_limit"
