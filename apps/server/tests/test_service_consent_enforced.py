"""graspy serves a learner only once a parent has agreed: the learner's session, record, threads,
chats, voice lessons, tutor and views all answer `403 consent_required` for one with no active
service consent, and the account's own routes stay open so the parent can agree."""

import asyncio

import pytest
from consent_sign_ins import consent_app
from service_agreed import service_agreed
from signed_in import UID, client, signed_in, use
from voice_worker import worker_env

from app.account.consents import SERVICE, revoke_consent
from app.cloudflare_sockets import PROTOCOL, connect
from app.security.session import issue

CONSENT = {"noticeVersion": 1, "firebaseIdToken": "fresh"}
CHAT = "c" * 12
GUARDED = [
    ("GET", "/api/learner?plan_id=mathematics.multiplication.table-2"),
    ("GET", "/api/learner/threads"),
    ("POST", f"/api/chats/{CHAT}/turns"),
    ("GET", f"/api/chats/{CHAT}/turns/{'t' * 8}/events"),
    ("POST", "/api/voice/samples"),
    ("POST", f"/api/voice/samples/{'a' * 12}/evaluation"),
    ("GET", "/api/voice/catalogue"),
    ("POST", "/api/learner/import"),
    ("POST", "/api/learner/plan"),
    ("PUT", "/api/learner/curriculum"),
    ("GET", "/api/voice/lesson"),
    ("POST", "/a2a"),
    ("POST", "/mcp"),
]


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return consent_app(monkeypatch, env)


async def learner_session(http, learner: str) -> None:
    """A session naming the learner as a device restoring it does, which asks for no consent."""
    await signed_in(http, firebaseIdToken="good", learnerId=learner)


async def added(http, name: str = "Ada") -> str:
    created = await http.post(
        "/api/account/learners", json={"name": name, "guardian": True}
    )
    return created.json()["id"]


async def sent(http, method: str, url: str):
    return await http.request(method, url, json={})


def refused_for_consent(response) -> bool:
    return (
        response.status_code == 403
        and response.json()["detail"]["code"] == "consent_required"
    )


async def test_a_learner_without_consent_is_given_no_session(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        refused = await http.post(f"/api/account/learners/{learner}/session")

    assert refused_for_consent(refused)


async def test_a_learner_with_consent_is_given_a_session(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await service_agreed(env, learner)
        chosen = await http.post(f"/api/account/learners/{learner}/session")

    assert chosen.status_code == 200 and chosen.json()["learner"]["id"] == learner


@pytest.mark.parametrize(("method", "url"), GUARDED)
async def test_each_route_of_a_learner_without_consent_answers_consent_required(
    app, method, url
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await learner_session(http, learner)
        refused = await sent(http, method, url)

    assert refused_for_consent(refused), refused.text


@pytest.mark.parametrize(("method", "url"), GUARDED)
async def test_each_route_of_a_learner_with_consent_is_not_refused_for_it(
    app, env, method, url
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await service_agreed(env, learner)
        await learner_session(http, learner)
        reached = await sent(http, method, url)

    assert not refused_for_consent(reached), reached.text
    assert reached.status_code != 503


async def test_a_turn_can_be_stopped_though_the_consent_is_gone(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await learner_session(http, learner)
        stopped = await http.post(f"/api/chats/{CHAT}/turns/{'t' * 8}/stop")

    assert not refused_for_consent(stopped)


async def test_a_consent_that_is_withdrawn_ends_service_at_the_next_request(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await service_agreed(env, learner)
        await learner_session(http, learner)
        before = await http.get("/api/learner/threads")
        await revoke_consent(env.DB, f"account:{UID}/{learner}", SERVICE, 2)
        after = await http.get("/api/learner/threads")
        tutor = await sent(http, "POST", "/a2a")

    assert before.status_code == 200
    assert refused_for_consent(after) and refused_for_consent(tutor)


async def test_a_siblings_consent_is_not_the_learners(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        ada, bo = await added(http), await added(http, "Bo")
        await service_agreed(env, bo)
        await learner_session(http, ada)
        refused = await http.get("/api/learner/threads")

    assert refused_for_consent(refused)


async def test_the_parent_can_agree_with_the_session_of_a_learner_who_has_not(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await learner_session(http, learner)
        listed = await http.get("/api/account/learners")
        agreed = await http.put(
            f"/api/account/learners/{learner}/consent", json=CONSENT
        )
        served = await http.get("/api/learner/threads")

    assert (
        listed.status_code == 200
        and listed.json()["learners"][0]["serviceConsent"] is None
    )
    assert agreed.status_code == 200
    assert served.status_code == 200


async def test_a_session_that_names_no_account_learner_has_no_parent_to_ask(app):
    async with client(app) as http:
        use(
            http,
            (await http.post("/api/session", json={"deviceId": "device-0001"})).json(),
        )
        device = await http.get(
            "/api/learner?plan_id=mathematics.multiplication.table-2"
        )
        await signed_in(http, firebaseIdToken="good")
        no_learner = await http.get("/api/account/learners")

    assert not refused_for_consent(device)
    assert no_learner.status_code == 200


async def test_where_consent_cannot_be_read_the_learner_is_refused_with_503(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await service_agreed(env, learner)
        await learner_session(http, learner)

        def down(*_):
            raise RuntimeError("D1 is down")

        monkeypatch.setattr(env.DB, "prepare", down)
        threads = await http.get("/api/learner/threads")
        tutor = await sent(http, "POST", "/a2a")

    for refused in (threads, tutor):
        assert refused.status_code == 503
        assert refused.json()["detail"]["code"] == "consent_unavailable"


class Upgrade:
    """A WebSocket upgrade as the Worker receives it: the session rides in the subprotocol."""

    def __init__(self, token: str) -> None:
        self.headers = {"Sec-WebSocket-Protocol": f"{PROTOCOL}, {token}"}


async def upgraded(app, env, monkeypatch, learner: str):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(
        app.state.session_secret, learner=f"account:{UID}/{learner}", account=UID
    ).token
    return await connect(env, app, Upgrade(token), (CHAT, "t" * 8, 0))


async def test_a_socket_for_a_learner_without_consent_is_refused(app, env, monkeypatch):
    refused = await upgraded(app, env, monkeypatch, "a" * 12)

    assert refused == (403, "consent_required")


async def test_a_socket_for_a_learner_with_consent_gets_as_far_as_the_chat(
    app, env, monkeypatch
):
    await service_agreed(env, "a" * 12)
    reached = await upgraded(app, env, monkeypatch, "a" * 12)

    assert reached == (404, "chat_not_found")


async def test_a_consent_read_that_hangs_is_refused_with_503(app, env, monkeypatch):
    async def hangs(*_):
        await asyncio.sleep(10)

    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added(http)
        await learner_session(http, learner)
        monkeypatch.setattr("app.api.service_consent.active_consent", hangs)
        monkeypatch.setattr("app.api.service_consent.READ_TIMEOUT_SECONDS", 0.01)
        refused = await http.get("/api/learner/threads")

    assert refused.status_code == 503
    assert refused.json()["detail"]["code"] == "consent_unavailable"
