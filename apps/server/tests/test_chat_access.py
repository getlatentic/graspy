"""Who reaches the tutor chat: a signed-in account's learner, and a visitor with no account (the web's
/try). An account that has chosen no learner is refused with `409 learner_required`. What is not the
chat (the record, lessons, views, voice) stays open to a device."""

import pytest
from consent_sign_ins import consent_app
from service_agreed import service_agreed
from signed_in import UID, client, parent_headers, signed_in, use
from voice_worker import worker_env

from app.cloudflare_sockets import PROTOCOL, connect
from app.security.session import issue

CHAT = "c" * 12
VISITOR = "v" * 20
TURN = "t" * 8
CHAT_ROUTES = [
    ("POST", "/a2a"),
    ("POST", f"/api/chats/{CHAT}/turns"),
    ("GET", f"/api/chats/{CHAT}/turns/{TURN}/events"),
]
NOT_THE_CHAT = [
    ("GET", "/api/learner?plan_id=mathematics.multiplication.table-2"),
    ("GET", "/api/voice/catalogue"),
    ("POST", "/mcp"),
    ("POST", "/mcp/public"),
]


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return consent_app(monkeypatch, env)


async def on_a_device(http) -> None:
    use(
        http, (await http.post("/api/session", json={"deviceId": "device-0001"})).json()
    )


async def sent(http, method: str, url: str):
    return await http.request(method, url, json={})


def code_of(response) -> tuple[int, str]:
    return response.status_code, response.json()["detail"]["code"]


async def as_a_visitor(http) -> None:
    use(
        http,
        (await http.post("/api/session", json={"visitor": VISITOR})).json(),
    )


@pytest.mark.parametrize(("method", "url"), CHAT_ROUTES)
async def test_a_device_session_with_no_account_or_visitor_is_refused_the_chat(
    app, method, url
):
    async with client(app) as http:
        await on_a_device(http)
        refused = await sent(http, method, url)

    assert code_of(refused) == (403, "account_required")


@pytest.mark.parametrize(
    ("method", "url", "status"),
    [
        ("GET", f"/api/chats/{CHAT}/turns/{TURN}/events", 404),
        ("POST", f"/api/chats/{CHAT}/turns", 422),
    ],
)
async def test_a_visitor_gets_to_the_chat_routes(app, method, url, status):
    async with client(app) as http:
        await as_a_visitor(http)
        reached = await sent(http, method, url)

    assert reached.status_code == status


async def test_a_visitor_gets_to_the_a2a_chat(app):
    async with client(app) as http:
        await as_a_visitor(http)
        reached = await sent(http, "POST", "/a2a")

    # Past the session guard, the SDK answers the empty body as a malformed JSON-RPC request.
    assert reached.json()["error"]["code"] == -32600


@pytest.mark.parametrize(("method", "url"), CHAT_ROUTES)
async def test_an_account_with_no_learner_is_refused_the_chat(app, method, url):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        refused = await sent(http, method, url)

    assert code_of(refused) == (409, "learner_required")


@pytest.mark.parametrize(("method", "url"), CHAT_ROUTES)
async def test_a_learner_the_account_holds_gets_to_the_chat(app, env, method, url):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = (
            await http.post(
                "/api/account/learners",
                json={"name": "Ada", "guardian": True},
                headers=await parent_headers(http),
            )
        ).json()["id"]
        await service_agreed(env, learner)
        await signed_in(http, firebaseIdToken="good", learnerId=learner)
        reached = await sent(http, method, url)

    assert reached.status_code not in (401, 403, 409, 503), reached.text


@pytest.mark.parametrize("body", [{}, None], ids=["empty body", "no body"])
@pytest.mark.parametrize(("method", "url"), CHAT_ROUTES)
async def test_a_session_minted_with_no_device_and_no_visitor_is_refused_the_chat(
    app, method, url, body
):
    """The visitor challenge gates only the visitor mint, so a session that names nobody must not
    be a way around it: it cannot chat, which is the one route that spends the visitor's limits."""
    async with client(app) as http:
        use(http, (await http.post("/api/session", json=body)).json())
        refused = await sent(http, method, url)

    assert code_of(refused) == (403, "account_required")


@pytest.mark.parametrize(("method", "url"), CHAT_ROUTES)
async def test_a_parent_session_is_refused_the_chat(app, method, url):
    token = issue(app.state.session_secret, account=UID, parent=True, gate="pin")
    async with client(app) as http:
        use(http, {"token": token.token, "expiresIn": token.expires_in})
        refused = await sent(http, method, url)

    assert code_of(refused) == (409, "learner_required")


async def test_the_turn_socket_of_a_session_that_names_nobody_is_refused(
    app, env, monkeypatch
):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(app.state.session_secret).token

    refused = await connect(env, app, Upgrade(token), (CHAT, TURN, 0))

    assert refused == (403, "account_required")


async def test_the_turn_socket_of_a_parent_session_is_refused(app, env, monkeypatch):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(app.state.session_secret, account=UID, parent=True, gate="pin").token

    refused = await connect(env, app, Upgrade(token), (CHAT, TURN, 0))

    assert refused == (409, "learner_required")


@pytest.mark.parametrize(("method", "url"), NOT_THE_CHAT)
async def test_a_device_keeps_what_is_not_the_chat(app, method, url):
    async with client(app) as http:
        await on_a_device(http)
        reached = await sent(http, method, url)

    assert reached.status_code not in (401, 403, 409), reached.text


async def test_a_device_can_still_stop_a_turn(app):
    async with client(app) as http:
        await on_a_device(http)
        stopped = await http.post(f"/api/chats/{CHAT}/turns/{TURN}/stop")

    assert stopped.status_code not in (401, 403, 409)


class Upgrade:
    def __init__(self, token: str) -> None:
        self.headers = {"Sec-WebSocket-Protocol": f"{PROTOCOL}, {token}"}


async def test_the_turn_socket_of_an_account_with_no_learner_is_refused_like_the_chat(
    app, env, monkeypatch
):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(app.state.session_secret, account=UID).token

    refused = await connect(env, app, Upgrade(token), (CHAT, TURN, 0))

    assert refused == (409, "learner_required")


async def test_the_turn_socket_of_a_visitor_with_no_account_gets_as_far_as_the_chat(
    app, env, monkeypatch
):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(app.state.session_secret, visitor=VISITOR).token

    reached = await connect(env, app, Upgrade(token), (CHAT, TURN, 0))

    assert reached == (404, "chat_not_found")


async def test_the_turn_socket_of_a_device_session_is_refused(app, env, monkeypatch):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(app.state.session_secret, learner="device-0001").token

    refused = await connect(env, app, Upgrade(token), (CHAT, TURN, 0))

    assert refused == (403, "account_required")


async def test_the_turn_socket_of_a_learner_the_account_holds_gets_as_far_as_the_chat(
    app, env, monkeypatch
):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    await service_agreed(env, "a" * 12)
    token = issue(
        app.state.session_secret, learner=f"account:{UID}/{'a' * 12}", account=UID
    ).token

    reached = await connect(env, app, Upgrade(token), (CHAT, TURN, 0))

    assert reached == (404, "chat_not_found")
