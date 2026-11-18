"""The tutor chat is for a signed-in account's learner: a device's own session is refused with
`403 account_required`, an account that has chosen no learner with `409 learner_required`, and
what is not the chat (the record, lessons, views, voice) stays open to a device."""

import pytest
from consent_sign_ins import consent_app
from service_agreed import service_agreed
from signed_in import UID, client, signed_in, use
from voice_worker import worker_env

from app.cloudflare_sockets import PROTOCOL, connect
from app.security.session import issue

CHAT = "c" * 12
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


@pytest.mark.parametrize(("method", "url"), CHAT_ROUTES)
async def test_a_device_with_no_account_is_refused_the_chat(app, method, url):
    async with client(app) as http:
        await on_a_device(http)
        refused = await sent(http, method, url)

    assert code_of(refused) == (403, "account_required")


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
                "/api/account/learners", json={"name": "Ada", "guardian": True}
            )
        ).json()["id"]
        await service_agreed(env, learner)
        await signed_in(http, firebaseIdToken="good", learnerId=learner)
        reached = await sent(http, method, url)

    assert reached.status_code not in (401, 403, 409, 503), reached.text


@pytest.mark.parametrize(("method", "url"), NOT_THE_CHAT)
async def test_a_device_keeps_what_is_not_the_chat(app, method, url):
    async with client(app) as http:
        await on_a_device(http)
        reached = await sent(http, method, url)

    assert reached.status_code not in (401, 403, 409), reached.text


class Upgrade:
    def __init__(self, token: str) -> None:
        self.headers = {"Sec-WebSocket-Protocol": f"{PROTOCOL}, {token}"}


@pytest.mark.parametrize(
    ("claims", "refused"),
    [
        ({"learner": "device-0001"}, (403, "account_required")),
        ({"account": UID}, (409, "learner_required")),
    ],
)
async def test_the_turn_socket_is_refused_like_the_chat(
    app, env, monkeypatch, claims, refused
):
    monkeypatch.setattr(
        "app.cloudflare_sockets.refusal", lambda status, code: (status, code)
    )
    token = issue(app.state.session_secret, **claims).token

    assert await connect(env, app, Upgrade(token), (CHAT, TURN, 0)) == refused
