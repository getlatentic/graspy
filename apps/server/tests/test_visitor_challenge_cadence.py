# ruff: noqa: F811
"""A visit that renews at the web's own cadence (src/lib/api/session.ts: a request made in the last
five minutes of a session's 12 hours renews it) is never challenged again before the challenge is 24
hours old, and the build the Worker reports is the one it was uploaded with."""

import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from test_visitor_challenge import (  # noqa: F401  (fixtures)
    app_with,
    claims_of,
    client,
    code_of,
    mint,
    siteverify,
)

from app.security.session import (
    TOKEN_TTL_SECONDS,
    VISITOR_CHALLENGE_MAX_AGE_SECONDS,
    VISITOR_MAX_RENEWALS,
)

RENEW_MARGIN_SECONDS = 5 * 60
WEB_RENEWAL_EVERY = TOKEN_TTL_SECONDS - RENEW_MARGIN_SECONDS


@pytest.fixture
def clock(monkeypatch):
    now = {"t": time.time()}
    monkeypatch.setattr(
        "app.api.visitor_session.time", SimpleNamespace(time=lambda: now["t"])
    )
    return now


def test_the_web_renews_twice_inside_the_challenges_day(client, siteverify, clock):
    session = mint(client, challenge="t")
    renewed = []
    for _ in range(2):
        clock["t"] += WEB_RENEWAL_EVERY
        session = mint(client, renewal=session.json()["token"])
        assert session.status_code == 200, session.text
        renewed.append(claims_of(session)["ren"])

    assert renewed == [1, 2]
    assert 2 * WEB_RENEWAL_EVERY <= VISITOR_CHALLENGE_MAX_AGE_SECONDS
    assert VISITOR_MAX_RENEWALS == 2
    assert len(siteverify.asked) == 1


def test_the_age_of_the_challenge_ends_a_visit_before_a_third_renewal(
    client, siteverify, clock
):
    session = mint(client, challenge="t")
    for _ in range(2):
        clock["t"] += WEB_RENEWAL_EVERY
        session = mint(client, renewal=session.json()["token"])

    clock["t"] += WEB_RENEWAL_EVERY
    third = mint(client, renewal=session.json()["token"])

    assert 3 * WEB_RENEWAL_EVERY > VISITOR_CHALLENGE_MAX_AGE_SECONDS
    assert (third.status_code, code_of(third)) == (403, "challenge_required")


def test_the_health_check_says_which_build_the_worker_is():
    uploaded = TestClient(app_with(build_id="0123abc"))
    unbuilt = TestClient(app_with())

    assert uploaded.get("/api/health").json()["details"]["build"] == "0123abc"
    assert unbuilt.get("/api/health").json()["details"]["build"] is None
