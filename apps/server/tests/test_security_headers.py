"""Security headers on every response: a Worker has no nginx to set them."""

import pytest
from fastapi.testclient import TestClient

from app.factory import create_app
from app.security.headers import SecurityHeadersMiddleware
from app.settings import Settings

EXPECTED = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
}
CSP = "default-src 'none'; frame-ancestors 'none'"


@pytest.fixture
def client():
    return TestClient(
        create_app(
            Settings(
                aws_bearer_token_bedrock="bedrock-test",
                session_secret="s",
                _env_file=None,
            )
        )
    )


@pytest.mark.parametrize(
    ("method", "path", "status"),
    [("GET", "/api/health", 200), ("POST", "/a2a", 401), ("GET", "/no-such-path", 404)],
    ids=["success", "rejection", "not-found"],
)
def test_every_response_carries_the_headers(client, method, path, status):
    response = client.request(method, path)

    assert response.status_code == status
    for name, value in EXPECTED.items():
        assert response.headers[name] == value
    assert response.headers["content-security-policy"] == CSP


def test_the_interactive_docs_are_not_blocked_by_the_api_policy(client):
    """They load scripts from a CDN, and exist only outside production."""
    response = client.get("/api/docs")

    assert response.status_code == 200
    assert "content-security-policy" not in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"


async def headers_sent(start: dict, path: str = "/api/x") -> list[tuple[bytes, bytes]]:
    sent = []

    async def app(scope, receive, send):
        await send(start)

    async def send(message):
        sent.append(message)

    await SecurityHeadersMiddleware(app)({"type": "http", "path": path}, None, send)
    return sent[0]["headers"]


async def test_a_header_the_app_set_is_replaced_not_repeated():
    """Whatever the application set, the response carries exactly one copy of
    each of these, with this middleware's value."""
    headers = await headers_sent(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"Referrer-Policy", b"unsafe-url"),
                (b"content-security-policy", b"default-src *"),
                (b"content-type", b"application/json"),
            ],
        }
    )

    assert sorted(headers) == sorted(
        [
            (b"content-type", b"application/json"),
            *[(name.encode(), value.encode()) for name, value in EXPECTED.items()],
            (b"content-security-policy", CSP.encode()),
        ]
    )


async def test_a_response_that_declares_no_headers_still_gets_them():
    """ASGI lets a response start omit its header list entirely."""
    headers = await headers_sent({"type": "http.response.start", "status": 204})

    assert dict(headers)[b"x-content-type-options"] == b"nosniff"


async def test_a_non_http_scope_passes_through_untouched():
    seen = []

    async def app(scope, receive, send):
        seen.append(scope["type"])

    await SecurityHeadersMiddleware(app)({"type": "lifespan"}, None, None)

    assert seen == ["lifespan"]
