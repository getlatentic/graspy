"""The Turnstile challenge in front of a visitor's session (the web's /try). Siteverify is faked at
the HTTP boundary, so the request the server makes and every answer it can get are exercised;
a real widget and a real Siteverify are not."""

import time
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from voice_worker import worker_env

from app.factory import create_app
from app.security import turnstile
from app.security.session import (
    VISITOR_CHALLENGE_MAX_AGE_SECONDS,
    challenged_at_of,
    issue,
    verify,
    visitor_of,
)
from app.security.turnstile import (
    ALWAYS_FAILS,
    ALWAYS_PASSES,
    SITEVERIFY_URL,
    ChallengeMode,
    mode_of,
)
from app.settings import Settings

SECRET = "session-secret"
WIDGET_SECRET = "0x-live-widget-secret"
SITE = "graspy.getlatentic.com"
VISITOR = "v" * 24
OTHER_VISITOR = "w" * 24
EDGE = {"CF-Connecting-IP": "203.0.113.9"}


def passed(**fields) -> dict:
    return {
        "success": True,
        "error-codes": [],
        "hostname": SITE,
        "action": "try",
        **fields,
    }


def refused(*codes: str) -> dict:
    return {"success": False, "error-codes": list(codes)}


class Siteverify:
    """Stands in for Cloudflare: answers what it is given, and keeps what it was asked."""

    def __init__(self) -> None:
        self.answer: dict | Exception | httpx.Response = passed()
        self.asked: list[dict[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        assert str(request.url) == SITEVERIFY_URL
        form = parse_qs(request.content.decode())
        self.asked.append({name: values[0] for name, values in form.items()})
        if isinstance(self.answer, Exception):
            raise self.answer
        if isinstance(self.answer, httpx.Response):
            return self.answer
        return httpx.Response(200, json=self.answer)


@pytest.fixture
def siteverify(monkeypatch) -> Siteverify:
    fake = Siteverify()
    real = httpx.AsyncClient
    monkeypatch.setattr(
        turnstile.httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(fake), **kw),
    )
    return fake


def app_with(widget_secret: str | None = WIDGET_SECRET, **extra):
    return create_app(
        Settings(
            session_secret=SECRET,
            aws_bearer_token_bedrock="b",
            turnstile_secret=widget_secret,
            cors_origins=f"https://{SITE},https://*.graspy.pages.dev",
            _env_file=None,
            **extra,
        )
    )


@pytest.fixture
def client(siteverify) -> TestClient:
    return TestClient(app_with())


def mint(client: TestClient, **body):
    return client.post("/api/session", json={"visitor": VISITOR, **body}, headers=EDGE)


def code_of(response: httpx.Response) -> str:
    return response.json()["detail"]["code"]


def claims_of(response: httpx.Response) -> dict:
    return verify(response.json()["token"], SECRET)


def test_a_visitor_with_no_token_is_asked_for_one(client, siteverify):
    response = mint(client)

    assert response.status_code == 403
    assert code_of(response) == "challenge_required"
    assert siteverify.asked == []


def test_a_passed_challenge_mints_a_session_that_says_when_it_passed(
    client, siteverify
):
    before = int(time.time())

    response = mint(client, challenge="token-1")

    assert response.status_code == 200
    claims = claims_of(response)
    assert visitor_of(claims) == VISITOR
    assert before <= challenged_at_of(claims) <= int(time.time())


def test_siteverify_is_asked_with_the_secret_the_token_and_the_edge_address(
    client, siteverify
):
    mint(client, challenge="token-1")

    assert siteverify.asked == [
        {"secret": WIDGET_SECRET, "response": "token-1", "remoteip": "203.0.113.9"}
    ]


def test_the_address_is_never_taken_from_a_header_a_client_sets(client, siteverify):
    client.post(
        "/api/session",
        json={"visitor": VISITOR, "challenge": "t"},
        headers={"X-Forwarded-For": "198.51.100.1"},
    )

    assert "remoteip" not in siteverify.asked[0]


@pytest.mark.parametrize(
    "codes",
    [
        ["invalid-input-response"],
        ["timeout-or-duplicate"],
        ["missing-input-response"],
    ],
)
def test_a_token_siteverify_refuses_mints_nothing(client, siteverify, codes):
    siteverify.answer = refused(*codes)

    response = mint(client, challenge="spent")

    assert (response.status_code, code_of(response)) == (403, "challenge_failed")


def test_a_token_used_twice_is_refused_the_second_time(client, siteverify):
    mint(client, challenge="once")
    siteverify.answer = refused("timeout-or-duplicate")

    again = mint(client, challenge="once")

    assert (again.status_code, code_of(again)) == (403, "challenge_failed")


def test_a_challenge_passed_on_another_site_is_refused(client, siteverify):
    siteverify.answer = passed(hostname="evil.example.net")

    response = mint(client, challenge="t")

    assert (response.status_code, code_of(response)) == (403, "challenge_failed")


@pytest.mark.parametrize("hostname", [SITE, "branch.graspy.pages.dev"])
def test_the_sites_the_web_app_is_served_from_are_accepted(
    client, siteverify, hostname
):
    siteverify.answer = passed(hostname=hostname)

    assert mint(client, challenge="t").status_code == 200


@pytest.mark.parametrize("action", ["login", "", None])
def test_a_challenge_for_another_action_is_refused(client, siteverify, action):
    siteverify.answer = passed(action=action)

    response = mint(client, challenge="t")

    assert (response.status_code, code_of(response)) == (403, "challenge_failed")


@pytest.mark.parametrize(
    "unreachable",
    [
        httpx.ConnectTimeout("slow"),
        httpx.ConnectError("down"),
        httpx.Response(500, text="oops"),
        httpx.Response(429, text="slow down"),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json=["not", "an", "object"]),
        httpx.Response(200, json=refused("internal-error")),
        httpx.Response(200, json=refused("invalid-input-secret")),
    ],
)
def test_when_siteverify_cannot_judge_nothing_is_admitted(
    client, siteverify, unreachable
):
    siteverify.answer = unreachable

    response = mint(client, challenge="t")

    assert (response.status_code, code_of(response)) == (503, "challenge_unavailable")


def test_a_token_longer_than_cloudflares_is_refused_before_siteverify(
    client, siteverify
):
    response = mint(client, challenge="x" * 2049)

    assert response.status_code == 422
    assert siteverify.asked == []


def test_a_session_is_renewed_without_a_new_challenge(client, siteverify):
    first = mint(client, challenge="t")

    renewed = mint(client, renewal=first.json()["token"])

    assert renewed.status_code == 200
    assert len(siteverify.asked) == 1
    assert challenged_at_of(claims_of(renewed)) == challenged_at_of(claims_of(first))
    assert renewed.json()["token"] != first.json()["token"]


def test_a_renewal_does_not_extend_the_challenge_for_ever(client, siteverify):
    now = time.time()
    old = int(now) - VISITOR_CHALLENGE_MAX_AGE_SECONDS - 1
    stale = issue(SECRET, visitor=VISITOR, challenged_at=old).token

    response = mint(client, renewal=stale)

    assert (response.status_code, code_of(response)) == (403, "challenge_required")


@pytest.mark.parametrize(
    "renewal",
    [
        lambda: issue(SECRET, visitor=OTHER_VISITOR, challenged_at=int(time.time())),
        lambda: issue(SECRET, visitor=VISITOR),
        lambda: issue(SECRET, learner="a" * 20),
        lambda: issue(SECRET, visitor=VISITOR, challenged_at=int(time.time()) + 3600),
        lambda: issue(
            "another-secret", visitor=VISITOR, challenged_at=int(time.time())
        ),
        lambda: issue(
            SECRET,
            visitor=VISITOR,
            challenged_at=int(time.time()),
            now=time.time() - 13 * 3600,
        ),
    ],
    ids=[
        "another visitors",
        "made before the challenge existed",
        "a learner's",
        "claiming a time still to come",
        "signed with another key",
        "expired",
    ],
)
def test_only_the_visitors_own_challenged_session_renews_without_a_challenge(
    client, siteverify, renewal
):
    response = mint(client, renewal=renewal().token)

    assert (response.status_code, code_of(response)) == (403, "challenge_required")


def test_a_garbage_renewal_is_a_missing_challenge(client):
    response = mint(client, renewal="not-a-token")

    assert (response.status_code, code_of(response)) == (403, "challenge_required")


def test_a_fresh_challenge_replaces_a_stale_renewal(client, siteverify):
    stale = issue(SECRET, visitor=VISITOR).token

    response = mint(client, renewal=stale, challenge="t")

    assert response.status_code == 200
    assert challenged_at_of(claims_of(response)) is not None


def test_the_devices_session_is_not_challenged(client, siteverify):
    for body in ({"deviceId": "d" * 16}, {}, None):
        response = client.post("/api/session", json=body, headers=EDGE)
        assert response.status_code == 200
        assert "cha" not in claims_of(response)
    assert siteverify.asked == []


def test_a_device_that_names_a_visitor_too_is_a_device(client, siteverify):
    response = client.post(
        "/api/session", json={"deviceId": "d" * 16, "visitor": VISITOR}
    )

    assert response.status_code == 200
    assert visitor_of(claims_of(response)) is None


def test_the_test_secret_that_passes_everything_skips_the_site_checks(monkeypatch):
    fake = Siteverify()
    fake.answer = {"success": True, "hostname": "example.com"}
    real = httpx.AsyncClient
    monkeypatch.setattr(
        turnstile.httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(fake), **kw),
    )
    client = TestClient(app_with(ALWAYS_PASSES))

    assert mint(client, challenge="XXXX.DUMMY.TOKEN.XXXX").status_code == 200


def test_the_test_secret_that_fails_everything_admits_nobody(monkeypatch):
    fake = Siteverify()
    fake.answer = refused("invalid-input-response")
    real = httpx.AsyncClient
    monkeypatch.setattr(
        turnstile.httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(fake), **kw),
    )
    client = TestClient(app_with(ALWAYS_FAILS))

    assert mint(client, challenge="t").status_code == 403


def test_development_without_a_secret_mints_unchallenged():
    client = TestClient(app_with(None))

    response = mint(client)

    assert response.status_code == 200
    assert visitor_of(claims_of(response)) == VISITOR
    assert challenged_at_of(claims_of(response)) is None


def test_health_says_how_the_challenge_is_set(client):
    assert client.get("/api/health").json()["details"]["challenge"] == "live"
    off = TestClient(app_with(None))
    assert off.get("/api/health").json()["details"]["challenge"] == "off"
    passes = TestClient(app_with(ALWAYS_PASSES))
    assert (
        passes.get("/api/health").json()["details"]["challenge"] == "test-always-passes"
    )


def test_the_modes_of_the_secrets():
    assert mode_of(None) is ChallengeMode.OFF
    assert mode_of("") is ChallengeMode.OFF
    assert mode_of(WIDGET_SECRET) is ChallengeMode.LIVE
    assert mode_of(ALWAYS_PASSES) is ChallengeMode.TEST_PASSES
    assert mode_of(ALWAYS_FAILS) is ChallengeMode.TEST_FAILS


@pytest.mark.parametrize("app_env", ["production", "staging"])
def test_a_deployment_needs_the_secret(app_env):
    with pytest.raises(ValueError, match="TURNSTILE_SECRET is required"):
        Settings(app_env=app_env, session_secret="s", _env_file=None)


@pytest.mark.parametrize("secret", [ALWAYS_PASSES, ALWAYS_FAILS])
def test_production_refuses_a_cloudflare_test_secret(secret):
    with pytest.raises(ValueError, match="published test secrets"):
        Settings(
            app_env="production",
            session_secret="s",
            turnstile_secret=secret,
            _env_file=None,
        )


def test_staging_may_use_the_test_secret_and_says_so(caplog):
    with caplog.at_level("WARNING"):
        settings = Settings(
            app_env="staging",
            session_secret="s",
            turnstile_secret=ALWAYS_PASSES,
            _env_file=None,
        )

    assert settings.challenge_mode is ChallengeMode.TEST_PASSES
    assert "gives no protection" in caplog.text
    assert ALWAYS_PASSES not in caplog.text


def test_a_deployment_with_a_live_secret_starts():
    settings = Settings(
        app_env="production",
        session_secret="s",
        aws_bearer_token_bedrock="b",
        turnstile_secret=WIDGET_SECRET,
        _env_file=None,
    )

    assert create_app(settings, voice=worker_env())
