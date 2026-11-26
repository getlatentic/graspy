"""The tutor chat for a visitor with no account (the web's /try): the chat is bound to the visitor's
id, its turns keep no learner record, and they are counted per session, per network and in all, and
refused past a limit. A signed-in learner's turns are not counted."""

import httpx
import pytest
from test_a2a import KEEPING, FakeTutor
from test_chat_routes import CHAT, SECRET, bearer, start_body
from test_durable_turn import durable_app, no_wait
from voice_worker import worker_env

from app.account.directory import learner_key
from app.agent.a2a import FAILED_TURN, a2a_routes
from app.agent.context import LearnerContext
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.api import anonymous_chat
from app.api.anonymous_chat import (
    anonymous_turn_refusal,
    edge_address,
    edge_network,
)
from app.caller import Keeping
from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.cloudflare_sockets import PROTOCOL, connect
from app.factory import create_app
from app.learner.notes import NOTHING_YET
from app.learner.store import InMemoryLearnerStore
from app.local_d1 import LocalD1
from app.security.guard import Session
from app.security.session import issue
from app.settings import Settings
from app.turns.access import may_follow
from app.turns.durable import DurableTurns
from app.turns.host import TaskTurnHost, TutorTurnSource, begin_turn
from app.turns.job import TurnJob, tutor_stream

BASE = "http://test"
ADA = "a" * 20
BOB = "b" * 20
FRIENDLY = "Try again later, or sign in to keep going"
EDGE = "CF-Connecting-IP"


class Visit:
    """The app with a fake tutor, and what visitors do with it."""

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

    def visitor(self, who: str = ADA, **claims) -> dict:
        return {"Authorization": f"Bearer {issue(SECRET, visitor=who, **claims).token}"}

    async def start(
        self, headers: dict, n: int = 0, chat: str = CHAT, **extra_headers
    ) -> httpx.Response:
        answer = await self.http.post(
            f"/api/chats/{chat}/turns",
            json=start_body(turn=f"turn-{n:04d}-xx"),
            headers={**headers, **extra_headers},
        )
        await self.host.idle()
        return answer

    async def take_turn(
        self, headers: dict, n: int = 0, chat: str = CHAT, **extra
    ) -> int:
        return (await self.start(headers, n, chat, **extra)).status_code

    async def events(self, headers: dict, chat: str = CHAT, turn: str = "turn-0000-xx"):
        return await self.http.get(
            f"/api/chats/{chat}/turns/{turn}/events", headers=headers
        )

    async def stop(self, headers: dict, chat: str = CHAT, turn: str = "turn-0000-xx"):
        return await self.http.post(
            f"/api/chats/{chat}/turns/{turn}/stop", headers=headers
        )

    async def all_rows(self) -> dict[str, int]:
        found = await self.app.state.tv_db.prepare(
            "SELECT bucket, turns FROM anonymous_chat_use"
        ).all()
        return {row["bucket"]: row["turns"] for row in found["results"]}

    async def rows(self) -> dict[str, int]:
        """The counts, without the markers of the turns counted."""
        return {
            bucket: turns
            for bucket, turns in (await self.all_rows()).items()
            if not bucket.startswith("turn:")
        }


@pytest.fixture
def visit():
    return Visit()


# The session of a visitor


async def test_a_visitor_session_names_the_visitor_and_no_device_or_learner(visit):
    issued = (await visit.http.post("/api/session", json={"visitor": ADA})).json()

    claims = issued["token"].split(".")[0]
    import base64
    import json

    body = json.loads(base64.urlsafe_b64decode(claims + "=" * (-len(claims) % 4)))
    assert body["vis"] == ADA
    assert "sub" not in body and "acct" not in body


async def test_a_device_session_carries_no_visitor(visit):
    issued = (
        await visit.http.post(
            "/api/session", json={"deviceId": "device-0001", "visitor": ADA}
        )
    ).json()

    started = await visit.http.post(
        f"/api/chats/{CHAT}/turns",
        json=start_body(),
        headers={"Authorization": f"Bearer {issued['token']}"},
    )

    assert started.status_code == 403
    assert started.json()["detail"]["code"] == "account_required"


# What is kept


async def test_a_visitors_turn_keeps_no_learner_record_though_the_token_names_a_device(
    visit,
):
    headers = visit.visitor(learner="anon-visitor-device-0001")

    assert await visit.take_turn(headers) == 200

    started = await visit.log.since(CHAT, 0, 1, (kinds.TURN_STARTED,))
    assert started[0].data["job"]["learner"] is None
    assert started[0].data["job"]["owner"] == f"visitor:{ADA}"
    assert (await KEEPING.learners.load("anon-visitor-device-0001")).conversations == []


class NoLearnerStore(InMemoryLearnerStore):
    """Fails on any read or write: a turn for no learner must touch none."""

    async def load(self, learner):
        raise AssertionError(f"read the record of {learner!r}")

    async def change(self, learner, change):
        raise AssertionError(f"changed the record of {learner!r}")

    async def plan(self, learner):
        raise AssertionError(f"read the plan of {learner!r}")

    async def keep_plan(self, learner, plan_json):
        raise AssertionError(f"kept the plan of {learner!r}")


class Spy:
    """A tutor that records what a turn gave it."""

    def __init__(self) -> None:
        self.seen = []

    async def stream(self, chat, message, context, calls, unanswered, notes, turn=None):
        self.seen.append((context, calls, notes))
        return
        yield  # pragma: no cover


async def test_a_visitors_turn_reads_and_writes_no_record_whatever_the_page_names():
    keeping = Keeping(
        learners=NoLearnerStore(),
        lessons=KEEPING.lessons,
        making=KEEPING.making,
        conversations=KEEPING.conversations,
        threads=KEEPING.threads,
    )
    tutor = Spy()
    job = TurnJob(
        chat=CHAT,
        turn="turn-0000-xx",
        learner=None,
        owner=f"visitor:{ADA}",
        message="hello",
        parts=[
            {"text": "hello"},
            {
                "data": {
                    "appCalls": [
                        {
                            "method": "tools/call",
                            "params": {
                                "name": "answer_practice",
                                "arguments": {
                                    "question": "2 + 2?",
                                    "options": ["3", "4"],
                                    "answerIndex": 1,
                                    "chosenIndex": 1,
                                    "where": {
                                        "planId": "someone-elses",
                                        "subjectSlug": "mathematics",
                                        "topic": "Fractions",
                                    },
                                },
                            },
                        }
                    ]
                }
            },
        ],
        metadata={
            "learner": {
                "planId": "someone-elses",
                "subjectSlug": "mathematics",
                "topic": "Fractions",
                "learner": "account:uid123/abc",
            }
        },
    )

    async for _ in tutor_stream(tutor, keeping, job):
        pass

    # The turn ran once, and the store, which raises on any read or write, was never asked: what the
    # page names is read as its claim, and the record, lesson and notes the tutor is given are empty.
    [(context, calls, notes)] = tutor.seen
    assert context.plan_id == "someone-elses"
    assert context.lesson is None
    assert [call.name for call in calls] == ["answer_practice"]
    assert notes == NOTHING_YET


def test_the_tutors_tools_only_return_what_the_app_does_and_touch_no_record():
    outputs = TurnOutputs()
    tools = {
        tool.__name__: tool
        for tool in tools_for(
            Turn(context=LearnerContext(empty_plan=True), message="hi"), outputs
        )
    }

    tools["set_details"](class_name="JSS 1", country="Nigeria")
    tools["give_choice"]("Which country?", ["Nigeria", "Ghana"])

    assert [action.type for action in outputs.actions] == ["set_details"]
    assert len(outputs.cards) == 1
    # None of them is given a store or a key: the tools take the context and nothing else.
    assert set(tools) >= {"set_details", "ask_class", "give_choice", "change_subjects"}


# Whose chat it is


async def test_a_visitor_cannot_use_a_chat_a_learner_began(visit):
    assert await visit.take_turn(bearer()) == 200

    codes = [
        await visit.take_turn(visit.visitor(), 1),
        (await visit.events(visit.visitor())).status_code,
        (await visit.stop(visit.visitor())).status_code,
    ]

    assert codes == [404, 404, 404]


async def test_two_visitors_cannot_share_a_chat_even_with_the_same_id(visit):
    assert await visit.take_turn(visit.visitor(ADA)) == 200

    codes = [
        await visit.take_turn(visit.visitor(BOB), 1),
        (await visit.events(visit.visitor(BOB))).status_code,
        (await visit.stop(visit.visitor(BOB))).status_code,
    ]
    again = await visit.take_turn(visit.visitor(ADA), 2)

    assert codes == [404, 404, 404]
    assert again == 200
    assert (await visit.events(visit.visitor(ADA))).status_code == 200


async def test_a_visitor_keeps_their_chat_across_sessions_renewed(visit):
    assert await visit.take_turn(visit.visitor(ADA)) == 200

    renewed = visit.visitor(ADA)

    assert await visit.take_turn(renewed, 1) == 200


def _ownerless_job_events() -> dict[str, dict]:
    """The first events of chats no visitor may use: one with no owner, whatever the job's shape
    (the real jobs, dumped as the server keeps them, and a chat made before jobs had owners)."""
    ownerless = TurnJob(chat=CHAT, turn="turn-0000-xx", message="hi")
    return {
        "a job with no learner and no owner": ownerless.model_dump(mode="json"),
        "a job from before owners, with a null learner": ownerless.model_dump(
            mode="json", exclude={"owner"}
        ),
        "a job from before owners, with no learner key": ownerless.model_dump(
            mode="json", exclude={"owner", "learner"}
        ),
    }


@pytest.mark.parametrize("shape", list(_ownerless_job_events()))
async def test_a_visitor_cannot_use_a_chat_with_no_owner_recorded(visit, shape):
    job = _ownerless_job_events()[shape]
    await visit.log.append_once(
        CHAT, kinds.TURN_STARTED, {"turn": "turn-0000-xx", "job": job}, 1
    )

    codes = [
        await visit.take_turn(visit.visitor(), 1),
        (await visit.events(visit.visitor())).status_code,
        (await visit.stop(visit.visitor())).status_code,
    ]

    assert codes == [404, 404, 404]


async def test_a_learner_keeps_a_chat_made_before_chats_had_owners(visit):
    held = learner_key("uid123", "dev1".ljust(12, "0"))
    old = TurnJob(chat=CHAT, turn="turn-0000-xx", message="hi", learner=held)
    data = {"turn": old.turn, "job": old.model_dump(mode="json", exclude={"owner"})}
    await visit.log.append_once(CHAT, kinds.TURN_STARTED, data, 1)

    assert await may_follow(visit.log, CHAT, held)
    assert not await may_follow(visit.log, CHAT, f"visitor:{ADA}")


async def test_a_visitor_cannot_use_a_learners_chat_over_a2a(log=None):
    log = ChatLog(LocalD1())
    app, host = durable_app(log, FakeTutor())
    first = await _a2a(app, "Hi", device="dev1".ljust(12, "0"))
    await host.idle()

    taken = await _a2a(app, "Mine now", context_id=first["context"])
    await host.idle()

    assert taken["states"][-1] == "FAILED"
    assert taken["answer"] == FAILED_TURN


async def test_two_visitors_cannot_share_a_chat_over_a2a():
    log = ChatLog(LocalD1())
    app, host = durable_app(log, FakeTutor())
    first = await _a2a(app, "Hi", visitor=ADA)
    await host.idle()

    taken = await _a2a(app, "Mine now", context_id=first["context"], visitor=BOB)
    await host.idle()

    assert taken["states"][-1] == "FAILED"


async def _a2a(app, text, context_id=None, device=None, visitor=None):
    from test_a2a import VISITOR, turn

    return await turn(
        app, text, context_id=context_id, device=device, visitor=visitor or VISITOR
    )


class Upgrade:
    def __init__(self, token: str) -> None:
        self.headers = {"Sec-WebSocket-Protocol": f"{PROTOCOL}, {token}"}


async def test_a_visitor_cannot_follow_a_learners_or_another_visitors_chat_on_the_socket(
    monkeypatch,
):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    env = worker_env()
    app = create_app(
        Settings(aws_bearer_token_bedrock="b", session_secret=SECRET, _env_file=None),
        voice=env,
    )
    log = ChatLog(env.DB)
    for chat, owner in (
        ("c" * 12, "account:uid123/aaaaaaaaaaaa"),
        ("d" * 12, f"visitor:{ADA}"),
    ):
        job = TurnJob(chat=chat, turn="t" * 8, message="hi", owner=owner)
        await begin_turn(log, job, 1)

    token = issue(SECRET, visitor=BOB).token
    refused = [
        await connect(env, app, Upgrade(token), (chat, "t" * 8, 0))
        for chat in ("c" * 12, "d" * 12)
    ]

    assert refused == [(404, "chat_not_found")] * 2


# The limits


async def test_a_session_is_refused_past_its_limit_in_friendly_words(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "SESSION_TURNS", 2)
    headers = visit.visitor()

    codes = [await visit.take_turn(headers, n) for n in range(3)]
    refused = await visit.start(headers, 9)

    assert codes == [200, 200, 429]
    assert refused.json()["detail"] == {"error": FRIENDLY, "code": "try_limit"}


async def test_a_network_is_refused_past_its_hour_whichever_session_it_uses(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 2)

    here = [
        await visit.take_turn(
            visit.visitor(f"{n}" * 20),
            n,
            chat=f"chat-here-{n:04d}",
            **{EDGE: "198.51.100.7"},
        )
        for n in range(3)
    ]
    elsewhere = await visit.take_turn(
        visit.visitor("9" * 20), 9, chat="chat-else-0009", **{EDGE: "198.51.100.8"}
    )

    assert here == [200, 200, 429]
    assert elsewhere == 200


async def test_a_network_is_refused_past_its_day(visit, monkeypatch):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_DAY", 1)

    first = await visit.take_turn(
        visit.visitor(ADA), 0, chat="chat-one-0000", **{EDGE: "198.51.100.7"}
    )
    second = await visit.take_turn(
        visit.visitor(BOB), 1, chat="chat-two-0001", **{EDGE: "198.51.100.7"}
    )

    assert (first, second) == (200, 429)


async def test_all_visitors_together_are_refused_past_the_day(visit, monkeypatch):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 2)

    codes = [
        await visit.take_turn(
            visit.visitor(f"{n}" * 20),
            n,
            chat=f"chat-{n:04d}-all",
            **{EDGE: f"198.51.100.{n}"},
        )
        for n in range(3)
    ]

    assert codes == [200, 200, 429]


async def test_a_turn_refused_by_a_wide_count_spends_none_of_the_narrow_ones(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 1)
    await visit.take_turn(
        visit.visitor(ADA), 0, chat="chat-one-0000", **{EDGE: "198.51.100.1"}
    )
    before = await visit.rows()

    refused = await visit.take_turn(
        visit.visitor(BOB), 1, chat="chat-two-0001", **{EDGE: "198.51.100.2"}
    )

    assert refused == 429
    assert await visit.rows() == before


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


# What is counted


async def test_a_turn_is_counted_once_it_is_valid_and_theirs_to_start(visit):
    headers = visit.visitor(ADA)
    await visit.take_turn(bearer(), 0, chat="chat-learner-1")

    invalid = await visit.http.post(
        f"/api/chats/{CHAT}/turns", json={"turn": "x"}, headers=headers
    )
    empty = await visit.http.post(
        f"/api/chats/{CHAT}/turns",
        json={"turn": "turn-0001-xx", "parts": [{"text": " "}]},
        headers=headers,
    )
    not_theirs = await visit.take_turn(headers, 2, chat="chat-learner-1")

    assert (invalid.status_code, empty.status_code, not_theirs) == (422, 422, 404)
    assert await visit.rows() == {}


async def test_a_start_sent_again_for_the_same_turn_is_counted_once(visit):
    headers = visit.visitor(ADA)

    first = await visit.take_turn(headers, 3)
    again = await visit.take_turn(headers, 3)

    assert (first, again) == (200, 200)
    assert set((await visit.rows()).values()) == {1}


async def test_a_visitor_session_with_the_wrong_kind_of_start_is_not_counted_by_reading(
    visit,
):
    headers = visit.visitor(ADA)
    await visit.take_turn(headers, 0)
    counted = await visit.rows()

    await visit.events(headers)
    await visit.stop(headers)

    assert await visit.rows() == counted


async def test_counts_of_a_window_that_is_over_are_forgotten(visit):
    database = visit.app.state.tv_db
    await database.prepare(
        "INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES ('old', 9, 1)"
    ).run()

    await visit.take_turn(visit.visitor())

    assert "old" not in await visit.rows()


async def test_a_turn_that_cannot_be_counted_is_refused_not_served(visit):
    class Broken:
        def prepare(self, _sql):
            raise RuntimeError("D1 is down")

    visit.app.state.tv_db = Broken()

    refused = await visit.start(visit.visitor())

    assert refused.status_code == 503
    assert refused.json()["detail"]["code"] == "try_unavailable"


# The network a count is for


async def test_only_the_address_the_edge_reports_makes_a_network(visit):
    headers = visit.visitor(ADA)

    await visit.take_turn(
        headers, 0, **{EDGE: "198.51.100.7", "X-Forwarded-For": "203.0.113.9"}
    )

    networks = [bucket for bucket in await visit.rows() if bucket.startswith("network")]
    assert all("198.51.100.7" in bucket for bucket in networks) and len(networks) == 2


async def test_a_header_a_client_can_set_is_never_a_network(visit):
    headers = visit.visitor(ADA)

    await visit.take_turn(
        headers,
        0,
        **{
            "X-Forwarded-For": "203.0.113.9",
            "X-Real-IP": "203.0.113.9",
            "Forwarded": "for=203.0.113.9",
        },
    )

    assert [b for b in await visit.rows() if b.startswith("network")] == []


async def test_with_no_address_a_visitor_is_counted_for_their_session_and_in_all_only(
    visit, monkeypatch
):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 1)

    codes = [
        await visit.take_turn(visit.visitor(f"{n}" * 20), n, chat=f"chat-{n:04d}-none")
        for n in range(3)
    ]

    assert codes == [200, 200, 200]
    assert sorted(b.split(":")[0] for b in await visit.rows()) == [
        "all-day",
        "session",
        "session",
        "session",
    ]


@pytest.mark.parametrize("address", ["", "not an address", "999.1.1.1", "unknown"])
def test_what_is_not_an_address_is_no_network(address):
    assert edge_network(address) is None


def test_an_ipv4_address_is_its_own_network_and_an_ipv6_one_its_64():
    assert edge_network("198.51.100.7") == "198.51.100.7"
    assert (
        edge_network("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
        == edge_network("2001:db8:1:2::1")
        == "2001:db8:1:2::/64"
    )
    assert edge_network("2001:db8:1:3::1") != edge_network("2001:db8:1:2::1")


async def test_two_addresses_of_one_ipv6_64_share_a_count(visit, monkeypatch):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 1)

    first = await visit.take_turn(
        visit.visitor(ADA), 0, chat="chat-one-0000", **{EDGE: "2001:db8:1:2::1"}
    )
    second = await visit.take_turn(
        visit.visitor(BOB), 1, chat="chat-two-0001", **{EDGE: "2001:db8:1:2:ffff::9"}
    )
    other = await visit.take_turn(
        visit.visitor("c" * 20), 2, chat="chat-tri-0002", **{EDGE: "2001:db8:1:3::1"}
    )

    assert (first, second, other) == (200, 429, 200)


# A2A: only a message that begins a turn is a turn


async def test_over_a2a_only_a_turn_is_counted_and_a_visitor_is_limited(monkeypatch):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 1)
    log = ChatLog(LocalD1())
    database = LocalD1()
    host = TaskTurnHost(log, TutorTurnSource(FakeTutor(), KEEPING), sleep=no_wait)
    from fastapi import FastAPI
    from test_a2a import SECRET as A2A_SECRET
    from test_a2a import settings, turn

    from app.security.guard import SessionMiddleware

    async def admit(session, headers, chat, turn):
        return await anonymous_turn_refusal(
            database, session, edge_address(headers), chat, turn
        )

    app = FastAPI()
    app.routes.extend(
        a2a_routes(settings(), FakeTutor(), KEEPING, DurableTurns(host, log), admit)
    )
    app.add_middleware(
        SessionMiddleware,
        prefixes=(settings().a2a_path_prefix,),
        secret=A2A_SECRET,
    )
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url=BASE,
        headers={"Authorization": f"Bearer {issue(A2A_SECRET, visitor=ADA).token}"},
    )

    for _ in range(3):
        await http.post(
            "/a2a",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "GetTask",
                "params": {"id": "x"},
            },
        )
    counted_by_reading = await database.prepare(
        "SELECT COUNT(*) AS n FROM anonymous_chat_use"
    ).first()
    first = await turn(app, "Hi")
    second = await turn(app, "Again")

    assert counted_by_reading["n"] == 0
    assert first["states"][-1] == "COMPLETED"
    assert second["states"][-1] == "REJECTED"
    assert FRIENDLY in second["answer"]


def test_a_session_with_no_session_id_still_has_the_all_count():
    found = anonymous_chat.counters(Session(learner=None, visitor=ADA), None, 0)

    assert [c.bucket.split(":")[0] for c in found] == ["all-day"]
