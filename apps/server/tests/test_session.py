"""The session token is a security boundary, so the cases that matter are the
ones where a client supplies something it was not given."""

import base64
import hashlib
import hmac
import json
import re

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from hypothesis import given
from hypothesis import strategies as st

from app.security.guard import SessionMiddleware, require_session
from app.security.session import (
    TOKEN_TTL_SECONDS,
    InvalidSessionToken,
    issue,
    resolve_secret,
    verify,
)

SECRET = "test-secret"
NOW = 1_800_000_000
# For requests, which are checked against the real clock.
LONG_AGO = 1_000_000_000

MALFORMED = "The session token is malformed."
FORGED = "The session token's signature does not match."
UNREADABLE = "The session token's payload is unreadable."
NO_EXPIRY = "The session token has no expiry."
EXPIRED = "The session token has expired."


def base64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def signed(payload: bytes, secret: str = SECRET) -> str:
    """A token built from the format's definition rather than from the code
    under test: base64url without padding, and HMAC-SHA256 over the payload."""
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).digest()
    return f"{base64url(payload)}.{base64url(signature)}"


def test_a_token_verifies_until_the_second_it_expires():
    token = issue(SECRET, now=NOW).token

    assert (
        verify(token, SECRET, now=NOW + TOKEN_TTL_SECONDS - 1)["exp"]
        == NOW + TOKEN_TTL_SECONDS
    )
    with pytest.raises(InvalidSessionToken, match=EXPIRED):
        verify(token, SECRET, now=NOW + TOKEN_TTL_SECONDS)


def test_a_token_is_safe_in_a_header_or_a_url():
    """Two base64url parts without padding, so it needs no escaping anywhere."""
    assert re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", issue(SECRET).token)


def test_each_token_is_distinct():
    """A shared identifier would make per-token counting meaningless."""
    first, second = issue(SECRET, now=NOW).token, issue(SECRET, now=NOW).token

    assert first != second
    assert first.split(".")[1] != second.split(".")[1]


def test_a_token_built_to_the_format_verifies():
    claims = verify(signed(json.dumps({"exp": NOW + 60}).encode()), SECRET, now=NOW)

    assert claims == {"exp": NOW + 60}


def _lifted_signature() -> str:
    """A real signature moved onto a payload it was not made for."""
    real_signature = issue(SECRET).token.split(".")[1]
    return (
        base64url(json.dumps({"jti": "attacker", "exp": NOW + 10**7}).encode())
        + "."
        + real_signature
    )


REJECTED = [
    pytest.param("", MALFORMED, id="empty"),
    pytest.param("no-separator", MALFORMED, id="no-dot"),
    pytest.param("e30", MALFORMED, id="payload-only"),
    pytest.param("a.b", MALFORMED, id="undecodable"),
    pytest.param(".\x80", MALFORMED, id="non-ascii-signature"),
    pytest.param("é.x", MALFORMED, id="non-ascii-payload"),
    pytest.param(".", FORGED, id="bare-dot"),
    pytest.param("e30.", FORGED, id="empty-signature"),
    pytest.param("!!!.???", FORGED, id="not-base64"),
    pytest.param(
        base64url(json.dumps({"exp": NOW + 10**7}).encode()) + ".forged",
        FORGED,
        id="tampered-expiry",
    ),
    pytest.param(_lifted_signature(), FORGED, id="lifted-signature"),
    pytest.param(issue("another-secret").token, FORGED, id="another-secret"),
    pytest.param(issue(SECRET).token + ".extra", FORGED, id="extra-part"),
    pytest.param(signed(b"\xff\xfe"), UNREADABLE, id="signed-non-text"),
    pytest.param(signed(b"{"), UNREADABLE, id="signed-non-json"),
    pytest.param(signed(b'{"jti":"x"}'), NO_EXPIRY, id="signed-without-expiry"),
    pytest.param(signed(b'{"exp":"never"}'), NO_EXPIRY, id="signed-text-expiry"),
    pytest.param(signed(b'{"exp":NaN}'), NO_EXPIRY, id="signed-nan-expiry"),
    pytest.param(signed(b'{"exp":Infinity}'), NO_EXPIRY, id="signed-infinite-expiry"),
    pytest.param(signed(b"[1800000060]"), NO_EXPIRY, id="signed-array"),
    pytest.param(
        issue(SECRET, now=NOW - TOKEN_TTL_SECONDS).token, EXPIRED, id="expired"
    ),
]


@pytest.mark.parametrize(("token", "reason"), REJECTED)
def test_a_token_is_rejected_by_the_check_meant_for_it(token, reason):
    """The reason proves which check refused it: a forgery refused only for
    being malformed would pass a test that checks for rejection alone."""
    with pytest.raises(InvalidSessionToken) as refused:
        verify(token, SECRET, now=NOW)

    assert str(refused.value) == reason


@given(st.text())
def test_no_text_makes_verification_fail_any_other_way(token):
    try:
        verify(token, SECRET, now=NOW)
    except InvalidSessionToken:
        pass


@given(st.binary())
def test_no_signed_payload_makes_verification_fail_any_other_way(payload):
    """Only the server can sign, so this guards against its own mistakes."""
    try:
        verify(signed(payload), SECRET, now=NOW)
    except InvalidSessionToken:
        pass


class _Settings:
    def __init__(self, *, session_secret=None, is_production=False):
        self.session_secret = session_secret
        self.is_production = is_production


@pytest.mark.parametrize(
    "is_production", [True, False], ids=["production", "development"]
)
def test_a_configured_secret_is_used_as_given(is_production):
    assert (
        resolve_secret(
            _Settings(session_secret="configured", is_production=is_production)
        )
        == "configured"
    )


def test_production_refuses_to_start_without_a_secret():
    with pytest.raises(RuntimeError) as refused:
        resolve_secret(_Settings(is_production=True))

    assert str(refused.value) == (
        "SESSION_SECRET is required in production: without it the session "
        "guard would sign with a key that changes on every restart."
    )


def test_development_signs_with_an_ephemeral_secret_and_says_so(caplog):
    first, second = resolve_secret(_Settings()), resolve_secret(_Settings())

    assert first and second and first != second
    warning = (
        "SESSION_SECRET is unset — signing with an ephemeral development key. "
        "Existing tokens stop working whenever the server restarts."
    )
    assert caplog.messages == [warning] * 2


def _guarded_app(prefix: str = "/a2a") -> FastAPI:
    app = FastAPI()
    app.add_middleware(SessionMiddleware, prefixes=(prefix, "/mcp"), secret=SECRET)

    @app.get("/generate", dependencies=[Depends(require_session)])
    async def generate():
        return {"ok": True}

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.api_route("/a2a", methods=["POST", "OPTIONS"])
    async def agent():
        return {"ok": True}

    @app.post("/a2a/tasks")
    async def agent_tasks():
        return {"ok": True}

    @app.post("/mcp")
    async def mcp():
        return {"ok": True}

    @app.post("/a2abc")
    async def neighbour():
        return {"ok": True}

    app.state.session_secret = SECRET
    return app


@pytest.fixture
def client():
    return TestClient(_guarded_app())


GUARDED = [
    ("GET", "/generate"),
    ("POST", "/a2a"),
    ("POST", "/a2a/tasks"),
    ("POST", "/mcp"),
]
REQUIRED = {"error": "A session token is required", "code": "session_required"}


@pytest.mark.parametrize(("method", "path"), GUARDED)
@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Bearer",
        "Basic YWRtaW46YWRtaW4=",
        "token abc",
        "Digest x",
        "bearer a.b",
    ],
    ids=[
        "absent",
        "empty",
        "prefix-only",
        "basic",
        "token-scheme",
        "digest",
        "lowercase",
    ],
)
def test_a_request_without_a_bearer_token_is_told_one_is_required(
    client, method, path, header
):
    headers = {} if header is None else {"Authorization": header}

    response = client.request(method, path, headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": REQUIRED}
    assert response.headers["content-type"] == "application/json"
    assert int(response.headers["content-length"]) == len(response.content)


@pytest.mark.parametrize(("method", "path"), GUARDED)
@pytest.mark.parametrize(
    ("token", "reason"),
    [
        ("a.b", MALFORMED),
        (issue("another-secret").token, FORGED),
        (issue(SECRET, now=LONG_AGO).token, EXPIRED),
    ],
    ids=["malformed", "forged", "expired"],
)
def test_an_invalid_token_is_refused_with_the_reason(
    client, method, path, token, reason
):
    """Both guards answer alike, so a client handles one shape of refusal."""
    response = client.request(
        method, path, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": {"error": reason, "code": "session_invalid"}}


@pytest.mark.parametrize(("method", "path"), GUARDED)
def test_a_header_with_a_byte_outside_ascii_is_refused_not_a_crash(
    client, method, path
):
    """compare_digest raises on it, which must not answer 500."""
    response = client.request(
        method, path, headers={"Authorization": b"Bearer e30.\x80"}
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": {"error": MALFORMED, "code": "session_invalid"}
    }


@pytest.mark.parametrize(("method", "path"), GUARDED)
def test_a_valid_token_is_let_through(client, method, path):
    response = client.request(
        method, path, headers={"Authorization": f"Bearer {issue(SECRET).token}"}
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/health"), ("POST", "/a2abc"), ("OPTIONS", "/a2a")],
    ids=["other-route", "shared-prefix", "preflight"],
)
def test_routes_outside_the_agent_prefix_and_preflights_stay_open(client, method, path):
    assert client.request(method, path).status_code == 200


def test_the_prefix_is_normalised():
    client = TestClient(_guarded_app(prefix="a2a/"))

    assert client.post("/a2a").status_code == 401
    assert client.post("/a2abc").status_code == 200


async def test_a_non_http_scope_passes_through_untouched():
    seen = []

    async def app(scope, receive, send):
        seen.append(scope["type"])

    await SessionMiddleware(app, prefixes=("/a2a",), secret=SECRET)(
        {"type": "lifespan"}, None, None
    )

    assert seen == ["lifespan"]
