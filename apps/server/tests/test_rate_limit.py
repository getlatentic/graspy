"""Per-client request budgets: which path spends which, and the refusal."""

import json

import pytest
from fastapi.testclient import TestClient

from app.factory import create_app
from app.security.rate_limit import (
    RETRY_AFTER_SECONDS,
    Budgets,
    RateLimitMiddleware,
    client_key,
)
from app.settings import Settings

BUDGETS = ("session", "generate", "agent", "api")


class Budget:
    def __init__(self, allowed: bool = True):
        self.allowed, self.keys = allowed, []

    async def allow(self, key: str) -> bool:
        self.keys.append(key)
        return self.allowed


def budgets(*spent: str) -> Budgets:
    return Budgets(**{name: Budget(allowed=name not in spent) for name in BUDGETS})


REQUEST_BODY = {"type": "http.request", "body": b'{"q": 1}', "more_body": False}


async def call(
    limits: Budgets, method: str, path: str, headers=(), scope_type: str = "http"
):
    """The messages sent back; an allowed request echoes the body it read."""
    sent = []

    async def app(scope, receive, send):
        request = await receive()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": request["body"]})

    async def receive():
        return REQUEST_BODY

    async def send(message):
        sent.append(message)

    scope = {
        "type": scope_type,
        "method": method,
        "path": path,
        "headers": list(headers),
        "client": ("203.0.113.9", 5),
    }
    await RateLimitMiddleware(
        app, budgets=limits, agent_prefix="/a2a", mcp_path="/mcp"
    )(scope, receive, send)
    return sent


@pytest.mark.parametrize(
    ("method", "path", "budget"),
    [
        ("POST", "/api/session", "session"),
        ("GET", "/api/curriculum/generate-stream", "generate"),
        ("GET", "/api/curriculum/path", "generate"),
        ("GET", "/api/subjects/generate-stream", "generate"),
        ("POST", "/a2a", "agent"),
        ("GET", "/a2a/.well-known/agent-card.json", "agent"),
        ("GET", "/api/health", "api"),
        ("POST", "/mcp", "api"),
        ("POST", "/api/voice/samples/gvm_1/evaluation", "generate"),
        ("POST", "/api/voice/samples", "api"),
        ("PUT", "/api/voice/samples/gvm_1/audio", "api"),
        ("GET", "/api/voice/lesson", "api"),
        ("GET", "/api/voice/teacher-audio/prompt", "api"),
    ],
)
async def test_each_path_spends_its_own_budget(method, path, budget):
    limits = budgets()

    await call(limits, method, path)

    spent = [name for name in BUDGETS if getattr(limits, name).keys]
    assert spent == [budget]


async def test_a_spent_budget_answers_429_with_a_readable_reason():
    sent = await call(budgets("generate"), "GET", "/api/curriculum/generate-stream")

    start, body = sent
    assert start["status"] == 429
    assert body["type"] == "http.response.body"
    assert json.loads(body["body"]) == {
        "error": "Too many requests",
        "code": "rate_limited",
    }
    assert sorted(start["headers"]) == sorted(
        [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body["body"])).encode()),
            (b"retry-after", str(RETRY_AFTER_SECONDS).encode()),
        ]
    )


async def test_an_allowed_request_reaches_the_app_with_its_body():
    sent = await call(budgets("generate"), "POST", "/api/session")

    assert sent[0]["status"] == 200
    assert sent[1]["body"] == REQUEST_BODY["body"]


@pytest.mark.parametrize("path", ["/.well-known/agent-card.json", "/"])
async def test_paths_outside_the_api_cost_nothing(path):
    limits = budgets(*BUDGETS)

    sent = await call(limits, "GET", path)

    assert sent[0]["status"] == 200


async def test_a_preflight_is_never_counted():
    """It carries no credentials; limiting it would break CORS before the real
    request is sent."""
    limits = budgets(*BUDGETS)

    sent = await call(limits, "OPTIONS", "/a2a")

    assert sent[0]["status"] == 200
    assert not any(getattr(limits, name).keys for name in BUDGETS)


@pytest.mark.parametrize(
    ("headers", "client", "expected"),
    [
        ([(b"cf-connecting-ip", b"198.51.100.7")], ("10.0.0.1", 1), "198.51.100.7"),
        ([], ("10.0.0.1", 1), "10.0.0.1"),
        ([], None, "unknown"),
    ],
    ids=["edge-address", "socket-address", "neither"],
)
def test_the_client_is_identified_by_the_address_cloudflare_saw(
    headers, client, expected
):
    assert client_key({"headers": headers, "client": client}) == expected


def test_a_429_in_the_real_app_still_carries_cors_and_security_headers():
    """Without CORS headers the browser sees an opaque network error and the
    client cannot tell it was throttled."""
    app = create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test",
            session_secret="s",
            cors_origins="https://app.example",
            _env_file=None,
        ),
        budgets=budgets("session"),
    )

    response = TestClient(app).post(
        "/api/session", headers={"Origin": "https://app.example"}
    )

    assert response.status_code == 429
    assert response.headers["access-control-allow-origin"] == "https://app.example"
    assert response.headers["x-content-type-options"] == "nosniff"
