"""The visitor chat under concurrency and over A2A: counts that racing turns cannot pass, a turn
counted once and only once it is admitted, the edge address as A2A receives it, who owns a chat
however the job was built, and a visitor's conversation kept apart from another's."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from test_a2a import KEEPING, FakeTutor, agent_app, settings, turn
from test_a2a import SECRET as A2A_SECRET
from test_anonymous_chat import ADA, BOB, EDGE, FRIENDLY, Visit
from test_chat_routes import CHAT, bearer, start_body
from test_chatlog import Interleaving
from test_durable_turn import no_wait

from app.account.directory import learner_key
from app.agent.a2a import FAILED_TURN, a2a_routes
from app.api import anonymous_chat
from app.api.anonymous_chat import anonymous_turn_refusal, edge_address
from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.factory import _admit
from app.local_d1 import LocalD1
from app.security.guard import Session, SessionMiddleware
from app.security.session import visitor_of
from app.turns.access import chat_owner, conversation_key, may_follow, may_start
from app.turns.durable import DurableTurns
from app.turns.host import TaskTurnHost, TutorTurnSource, begin_turn
from app.turns.job import TurnJob

HELD = learner_key("uid123", "dev1".ljust(12, "0"))


@pytest.fixture
def visit():
    return Visit()


async def counts(database) -> dict[str, int]:
    found = await database.prepare("SELECT bucket, turns FROM anonymous_chat_use").all()
    return {
        row["bucket"]: row["turns"]
        for row in found["results"]
        if not row["bucket"].startswith("turn:")
    }


def visitor_session(n: int, who: str = ADA) -> Session:
    return Session(learner=None, visitor=who, jti=f"jti-{n:04d}")


async def attempt(database, n: int, address: str | None = None, turn_id="turn-0000-xx"):
    return await anonymous_turn_refusal(
        database, visitor_session(n), address, f"chat-{n:04d}-xx", turn_id
    )


# A: whose a chat is, however the job was built


def test_a_job_that_names_a_learner_and_no_owner_is_owned_by_the_learner():
    job = TurnJob(chat=CHAT, turn="turn-0000-xx", learner=HELD, message="hi")

    assert job.owner == HELD
    assert job.model_dump(mode="json")["owner"] == HELD


def test_a_visitors_job_keeps_the_visitor_as_owner_and_has_no_learner():
    job = TurnJob(chat=CHAT, turn="turn-0000-xx", owner=f"visitor:{ADA}", message="hi")

    assert (job.learner, job.owner) == (None, f"visitor:{ADA}")


async def test_a_learner_keeps_a_chat_begun_by_a_job_that_names_only_the_learner(visit):
    job = TurnJob(chat=CHAT, turn="turn-0000-xx", learner=HELD, message="hi")
    await begin_turn(visit.log, job, 1)

    assert await may_follow(visit.log, CHAT, HELD)
    assert await may_start(visit.log, CHAT, HELD)
    assert not await may_follow(visit.log, CHAT, f"visitor:{ADA}")


async def test_an_event_whose_owner_is_null_falls_back_to_its_learner(visit):
    job = {"chat": CHAT, "learner": HELD, "owner": None}
    await visit.log.append_once(
        CHAT, kinds.TURN_STARTED, {"turn": "turn-0000-xx", "job": job}, 1
    )

    assert await may_follow(visit.log, CHAT, HELD)


async def test_a_learner_reads_the_chat_they_began_over_rest(visit):
    assert await visit.take_turn(bearer()) == 200

    assert (await visit.events(bearer())).status_code == 200
    assert chat_owner(Session(learner=HELD, account="uid123")) == HELD


# B: a visitor's conversation is theirs when the server keeps no chat log


async def test_two_visitors_who_send_one_context_id_do_not_share_a_conversation():
    tutor = FakeTutor()
    app = agent_app(tutor)
    first = await turn(app, "Hi", visitor=ADA)

    await turn(app, "Mine now", context_id=first["context"], visitor=BOB)

    keys = [conversation for conversation, _ in tutor.calls]
    assert keys == [
        conversation_key(f"visitor:{ADA}", first["context"]),
        conversation_key(f"visitor:{BOB}", first["context"]),
    ]


async def test_a_visitor_cannot_reach_a_learners_conversation_by_its_context_id():
    tutor = FakeTutor()
    app = agent_app(tutor)
    learners = await turn(app, "Hi", device="dev1".ljust(12, "0"))

    await turn(app, "Mine now", context_id=learners["context"], visitor=ADA)

    learners_key, visitors_key = (conversation for conversation, _ in tutor.calls)
    assert learners_key == learners["context"]
    assert visitors_key == conversation_key(f"visitor:{ADA}", learners["context"])


# C: a count that turns racing for it cannot pass


async def test_turns_racing_for_the_last_places_of_the_day_do_not_pass_it(monkeypatch):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 3)
    database = Interleaving()

    answers = await asyncio.gather(*(attempt(database, n) for n in range(12)))

    refused = [a for a in answers if a is not None]
    assert len(answers) - len(refused) == 3
    assert {a.status_code for a in refused} == {429}
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("all-day"))] == 3
    # The nine turns that were refused kept none of the session counts they added to.
    assert sorted(b.split(":")[0] for b in held) == ["all-day"] + ["session"] * 3


async def test_turns_racing_from_one_network_do_not_pass_its_hour(monkeypatch):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 2)
    database = Interleaving()

    answers = await asyncio.gather(
        *(attempt(database, n, "198.51.100.7") for n in range(10))
    )

    assert sum(a is None for a in answers) == 2
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("network-hour"))] == 2
    assert held[next(b for b in held if b.startswith("all-day"))] == 2


async def test_one_session_racing_with_itself_does_not_pass_its_limit(monkeypatch):
    monkeypatch.setattr(anonymous_chat, "SESSION_TURNS", 2)
    database = Interleaving()
    session = visitor_session(1)

    answers = await asyncio.gather(
        *(
            anonymous_turn_refusal(database, session, None, f"chat-{n:04d}-xx", "t" * 8)
            for n in range(8)
        )
    )

    assert sum(a is None for a in answers) == 2
    assert (await counts(database))["session:jti-0001"] == 2


async def test_a_turn_started_twice_at_once_is_counted_once():
    database = Interleaving()

    answers = await asyncio.gather(*(attempt(database, 1) for _ in range(6)))

    assert answers == [None] * 6
    held = await counts(database)
    assert set(held.values()) == {1}
    assert sorted(b.split(":")[0] for b in held) == ["all-day", "session"]


async def test_a_turn_started_again_after_it_was_counted_is_not_counted_again():
    database = LocalD1()

    assert await attempt(database, 1) is None
    assert await attempt(database, 1) is None

    assert set((await counts(database)).values()) == {1}


async def test_a_counted_turn_is_admitted_again_though_the_day_is_full(monkeypatch):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 1)
    database = LocalD1()
    assert await attempt(database, 1) is None

    assert await attempt(database, 1) is None
    assert (await attempt(database, 2)).status_code == 429


# D: the address A2A receives, and a call with no session


def test_the_edge_address_is_found_whatever_the_case_of_the_header():
    assert edge_address({"CF-Connecting-IP": "198.51.100.7"}) == "198.51.100.7"
    assert edge_address({"cf-connecting-ip": "198.51.100.7"}) == "198.51.100.7"
    assert edge_address({"x-forwarded-for": "198.51.100.7"}) is None
    assert edge_address({}) is None


def limited_a2a(
    database, turns: DurableTurns | None = None, tutor: FakeTutor | None = None
) -> FastAPI:
    """The A2A routes behind the session guard, admitting turns as the app does."""
    state = SimpleNamespace(state=SimpleNamespace(tv_db=database))
    app = FastAPI()
    app.routes.extend(
        a2a_routes(settings(), tutor or FakeTutor(), KEEPING, turns, _admit(state))
    )
    app.add_middleware(
        SessionMiddleware, prefixes=(settings().a2a_path_prefix,), secret=A2A_SECRET
    )
    return app


async def test_over_a2a_the_edge_address_makes_the_network_the_sdk_passes_it_on(
    monkeypatch,
):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 1)
    database = LocalD1()
    app = limited_a2a(database)

    here = await turn(app, "Hi", visitor=ADA, headers={EDGE: "198.51.100.7"})
    same = await turn(app, "Hi", visitor=BOB, headers={EDGE: "198.51.100.7"})
    other = await turn(app, "Hi", visitor="c" * 20, headers={EDGE: "198.51.100.8"})

    assert here["states"][-1] == "COMPLETED"
    assert same["states"][-1] == "REJECTED" and FRIENDLY in same["answer"]
    assert other["states"][-1] == "COMPLETED"
    held = await counts(database)
    assert sum(b.startswith("network-hour:198.51.100.7") for b in held) == 1


async def test_over_a2a_with_no_edge_address_a_visitor_is_counted_by_session_and_in_all(
    monkeypatch,
):
    monkeypatch.setattr(anonymous_chat, "NETWORK_TURNS_PER_HOUR", 1)
    monkeypatch.setattr(anonymous_chat, "SESSION_TURNS", 1)
    database = LocalD1()
    app = limited_a2a(database)

    first = [await turn(app, "Hi", visitor=who) for who in (ADA, BOB, "c" * 20)]
    again = await turn(app, "Hi", visitor=ADA)

    assert [r["states"][-1] for r in first] == ["COMPLETED"] * 3
    held = await counts(database)
    assert not any(b.startswith("network") for b in held)
    # Each call is a session of its own (a new token), so the session count never refuses.
    assert again["states"][-1] == "COMPLETED"
    assert sum(b.startswith("session:") for b in held) == 4
    assert held[next(b for b in held if b.startswith("all-day"))] == 4


async def test_a_call_with_no_session_is_refused_not_admitted():
    state = SimpleNamespace(state=SimpleNamespace(tv_db=LocalD1()))

    refused = await _admit(state)(None, {}, "chat-0001-xx", "turn-0001-xx")

    assert refused is not None and refused.status_code == 401
    assert await counts(state.state.tv_db) == {}


# E: a turn is counted once it is admitted, and once


async def test_a_message_too_large_to_keep_is_refused_before_it_is_counted(visit):
    body = start_body()
    body["metadata"] = {"blob": "x" * 300_000}

    refused = await visit.http.post(
        f"/api/chats/{CHAT}/turns", json=body, headers=visit.visitor()
    )

    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "turn_too_large"
    assert await visit.all_rows() == {}


async def test_one_turn_started_twice_at_once_over_rest_is_counted_once(visit):
    visit.app.state.tv_db = Interleaving()
    headers = visit.visitor()

    answers = await asyncio.gather(
        *(
            visit.http.post(
                f"/api/chats/{CHAT}/turns", json=start_body(), headers=headers
            )
            for _ in range(4)
        )
    )
    await visit.host.idle()

    assert [a.status_code for a in answers] == [200] * 4
    assert set((await visit.rows()).values()) == {1}


async def test_over_a2a_a_turn_in_a_chat_that_is_not_theirs_is_not_counted():
    log = ChatLog(LocalD1())
    database = LocalD1()
    host = TaskTurnHost(log, TutorTurnSource(FakeTutor(), KEEPING), sleep=no_wait)
    app = limited_a2a(database, DurableTurns(host, log))
    first = await turn(app, "Hi", visitor=ADA)
    await host.idle()

    taken = await turn(app, "Mine now", context_id=first["context"], visitor=BOB)
    await host.idle()

    assert taken["states"][-1] == "FAILED" and taken["answer"] == FAILED_TURN
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("all-day"))] == 1
    assert sum(b.startswith("session") for b in held) == 1


# F: a learner's turn asks nothing of the visitor limits


async def test_a_learners_turn_does_not_touch_the_limits_store(visit):
    # A learner's turn reads nothing of the limits: with the store gone from the app, it is served.
    del visit.app.state.tv_db

    assert await visit.take_turn(bearer()) == 200


# G: renewing a visitor's session keeps the visitor


async def test_a_renewed_visitor_session_keeps_the_visitor_and_the_chat(visit):
    import base64
    import json

    def claims(token: str) -> dict:
        payload = token.split(".")[0]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))

    first = (await visit.http.post("/api/session", json={"visitor": ADA})).json()
    renewed = (await visit.http.post("/api/session", json={"visitor": ADA})).json()
    chat = {"Authorization": f"Bearer {first['token']}"}
    after = {"Authorization": f"Bearer {renewed['token']}"}

    assert claims(first["token"])["vis"] == claims(renewed["token"])["vis"] == ADA
    assert claims(first["token"])["jti"] != claims(renewed["token"])["jti"]
    assert await visit.take_turn(chat) == 200
    assert await visit.take_turn(after, 1) == 200


# Where the server keeps no chat log, nothing dedupes a turn, so every run is counted


async def test_with_no_chat_log_a_repeated_turn_id_is_counted_and_refused_not_run_free(
    monkeypatch,
):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 2)
    database, tutor = LocalD1(), FakeTutor()
    app = limited_a2a(database, tutor=tutor)

    results = [
        await turn(app, "Hi", context_id="ctx-0001", message_id="fixed-id-0001")
        for _ in range(5)
    ]

    assert [r["states"][-1] for r in results] == ["COMPLETED"] * 2 + ["REJECTED"] * 3
    assert len(tutor.calls) == 2


async def test_with_no_chat_log_turns_racing_with_one_id_are_each_counted_and_run():
    database, tutor = Interleaving(), FakeTutor()
    app = limited_a2a(database, tutor=tutor)

    results = await asyncio.gather(
        *(
            turn(app, "Hi", context_id="ctx-0001", message_id="fixed-id-0001")
            for _ in range(4)
        )
    )

    assert [r["states"][-1] for r in results] == ["COMPLETED"] * 4
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("all-day"))] == len(tutor.calls)


async def test_with_a_chat_log_a_repeated_turn_id_runs_and_is_counted_once():
    log = ChatLog(LocalD1())
    database, tutor = LocalD1(), FakeTutor()
    host = TaskTurnHost(log, TutorTurnSource(tutor, KEEPING), sleep=no_wait)
    app = limited_a2a(database, DurableTurns(host, log), tutor)

    for _ in range(3):
        await turn(app, "Hi", context_id="ctx-0001", message_id="fixed-id-0001")
        await host.idle()

    assert len(tutor.calls) == 1
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("all-day"))] == 1


async def test_two_owners_who_send_one_chat_and_turn_id_are_each_counted():
    database = LocalD1()

    first = await anonymous_turn_refusal(
        database, visitor_session(1, ADA), None, "chat-0001-xx", "turn-0001-xx"
    )
    second = await anonymous_turn_refusal(
        database, visitor_session(2, BOB), None, "chat-0001-xx", "turn-0001-xx"
    )

    assert (first, second) == (None, None)
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("all-day"))] == 2


# What a count's answer is believed for


class AlwaysOneChange(LocalD1):
    """A D1 whose `meta.changes` says one row changed whatever the statement did."""

    async def batch(self, statements):
        results = await super().batch(statements)
        for result in results:
            result["meta"]["changes"] = 1
        return results


class Unreadable(LocalD1):
    """A D1 that commits a batch of counts and then answers with something unreadable."""

    async def batch(self, statements):
        results = await super().batch(statements)
        return [{} for _ in results]


async def test_a_refused_count_never_reads_as_added_whatever_meta_changes_says(
    monkeypatch,
):
    monkeypatch.setattr(anonymous_chat, "TURNS_PER_DAY", 1)
    database = AlwaysOneChange()

    first = await attempt(database, 1)
    second = await attempt(database, 2)

    assert first is None
    assert second is not None and second.status_code == 429
    held = await counts(database)
    assert held[next(b for b in held if b.startswith("all-day"))] == 1


async def test_counts_added_by_a_batch_whose_answer_cannot_be_read_are_given_back():
    database = Unreadable()

    refused = await attempt(database, 1)

    assert refused is not None and refused.status_code == 503
    assert await counts(database) == {}


# A conversation's key, and the ids it is made of


def test_two_pairs_of_ids_that_join_to_one_string_make_two_keys():
    assert conversation_key("visitor:a", "b/c") != conversation_key("visitor:a/b", "c")
    assert conversation_key("visitor:a", "b/c") == conversation_key("visitor:a", "b/c")
    assert conversation_key("visitor:a", "x") != conversation_key("account:a", "x")


def test_only_an_id_the_session_endpoint_accepts_is_a_visitor():
    assert visitor_of({"vis": ADA}) == ADA
    for bad in ("a/b" * 8, "short", "x" * 65, "a b" * 8, "visitor:" + "a" * 16):
        assert visitor_of({"vis": bad}) is None
