"""Signing a TV in from a phone: every state of a request, expiry, the limits, and what an account
that is not the approver, a child, a copy of a credential or a replay can do. docs/TV_SIGN_IN.md
has the design."""

import asyncio
import logging
import re
import time
from dataclasses import replace

import pytest
from consent_sign_ins import OTHER_UID, consent_app
from signed_in import UID, as_parent, chosen, client, signed_in, use
from voice_worker import worker_env

from app.account import tv_links, tv_sessions
from app.account.directory import account_key, learner_key
from app.account.tv_codes import (
    USER_CODE_ALPHABET,
    confirmation_matches,
    device_label,
    hash_secret,
    masked_email,
    new_user_code,
    normalised_user_code,
    successor_of,
)
from app.api import routes as routes_module
from app.security.rate_limit import Budgets, source_of
from app.security.session import TV_TOKEN_TTL_SECONDS, tv_of, verify

BASE = 1_800_000_000_000
START = "/api/tv-sign-in"
TOKEN = f"{START}/token"
CONTINUE = f"{START}/continue"
CANCEL = f"{START}/cancel"
SESSION = f"{START}/session"
SIGN_OUT = f"{START}/sign-out"
LOOKUP = f"{START}/lookup"
APPROVE = f"{START}/approve"
DENY = f"{START}/deny"
DEVICES = f"{START}/devices"
SAMSUNG = "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 Chrome/94 TV Safari/537.36"
CONSENT = {"noticeVersion": 1, "firebaseIdToken": "fresh"}


class Clock:
    def __init__(self) -> None:
        self.ms = BASE

    def advance(self, seconds: float) -> None:
        self.ms += int(seconds * 1000)


@pytest.fixture
def clock(monkeypatch):
    ticking = Clock()
    monkeypatch.setattr("app.api.tv_sign_in_routes.now_ms", lambda: ticking.ms)
    return ticking


@pytest.fixture
def app(monkeypatch, clock):
    application = consent_app(monkeypatch, worker_env())
    signs_in = routes_module.verified

    async def with_address(id_token, api_key, **kwargs):
        return replace(
            await signs_in(id_token, api_key, **kwargs), email="tosin@gmail.com"
        )

    monkeypatch.setattr(routes_module, "verified", with_address)
    return application


async def add_learner(http, name: str, token: str) -> str:
    created = await http.post(
        "/api/account/learners",
        json={
            "name": name,
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": token},
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


@pytest.fixture
async def phone(app):
    """A parent's phone: signed in with Google just now, one learner with a parent's agreement."""
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        http.learner = await add_learner(http, "Ada", "fresh")
        await as_parent(http)
        yield http


@pytest.fixture
async def other_phone(app):
    """Another account's parent."""
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good2")
        http.learner = await add_learner(http, "Eve", "other")
        await as_parent(http, "other")
        yield http


@pytest.fixture
async def tv(app):
    async with client(app) as http:
        yield http


async def requested(tv, **headers) -> dict:
    response = await tv.post(START, headers={"User-Agent": SAMSUNG, **headers})
    assert response.status_code == 201, response.text
    return response.json()


async def polled(tv, request: dict) -> dict:
    response = await tv.post(TOKEN, json={"deviceCode": request["deviceCode"]})
    assert response.status_code == 200
    return response.json()


async def continued(tv, request: dict) -> dict:
    response = await tv.post(CONTINUE, json={"deviceCode": request["deviceCode"]})
    assert response.status_code == 200, response.text
    return response.json()


def last_four(request: dict) -> str:
    return request["userCode"][-4:]


async def looked_up(phone, request: dict):
    return await phone.post(LOOKUP, json={"userCode": request["userCode"]})


async def approved(phone, request: dict, learner: str | None = None, confirm=None):
    """Looks the code up, as the page does, then approves with the last four characters."""
    await looked_up(phone, request)
    return await phone.post(
        APPROVE,
        json={
            "userCode": request["userCode"],
            "learnerId": learner or phone.learner,
            "confirm": confirm or last_four(request),
        },
    )


async def signed_in_tv(tv, phone, clock) -> dict:
    """The whole flow: approval, the TV's confirmation, and what the TV is given."""
    request = await requested(tv)
    assert (await approved(phone, request)).status_code == 204
    clock.advance(request["interval"])
    assert (await polled(tv, request))["status"] == "linking"
    answer = await continued(tv, request)
    assert answer["status"] == "approved"
    return answer


def rows(app, table: str) -> list[dict]:
    return [
        dict(row)
        for row in app.state.tv_db.connection.execute(f"SELECT * FROM {table}")
    ]


# What a TV is asked for and shown


def test_the_short_code_uses_only_symbols_that_cannot_be_mistaken():
    assert not set("0O1I") & set(USER_CODE_ALPHABET)
    assert len(set(USER_CODE_ALPHABET)) == 32
    for _ in range(200):
        code = new_user_code()
        assert len(code) == 8
        assert set(code) <= set(USER_CODE_ALPHABET)


def test_a_typed_code_ignores_case_spaces_and_dashes_and_rejects_anything_else():
    assert normalised_user_code(" abcd-efg2 ") == "ABCDEFG2"
    assert normalised_user_code("ABCD EFG2") == "ABCDEFG2"
    for bad in (
        "ABCDEFG",
        "ABCDEFG22",
        "ABCDEFG0",
        "ABCDEFGO",
        "ABCDEFG1",
        "",
        "é" * 8,
    ):
        assert normalised_user_code(bad) is None


def test_the_confirmation_is_the_last_four_characters_whatever_their_case_or_spacing():
    assert confirmation_matches("ABCDEFG2", "efg2")
    assert confirmation_matches("ABCDEFG2", " e-f g2 ")
    for wrong in ("ABCD", "EFG3", "FG2", "", "XEFG2", "ABCDEFG2"):
        assert not confirmation_matches("ABCDEFG2", wrong)


@pytest.mark.parametrize(
    ("agent", "label"),
    [
        (SAMSUNG, "Samsung TV"),
        ("Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/79", "LG TV"),
        ("Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233) Chrome/80", "Fire TV"),
        ("Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36", "Chrome browser"),
        ("Mozilla/5.0 (Macintosh) Version/17 Safari/605.1.15", "Safari browser"),
        ("", "Unknown device"),
        (None, "Unknown device"),
    ],
)
def test_the_device_is_named_from_what_it_calls_itself(agent, label):
    assert device_label(agent) == label


async def test_a_request_gives_a_long_device_code_a_short_code_and_where_to_go(tv):
    request = await requested(tv, Origin="http://localhost:5173")

    assert len(request["deviceCode"]) >= 40
    assert normalised_user_code(request["userCode"]) == request["userCode"]
    assert request["expiresIn"] == 600
    assert request["interval"] == 5
    assert request["verificationUri"] == "http://localhost:5173/link"
    assert (
        request["verificationUriComplete"]
        == f"http://localhost:5173/link#code={request['userCode']}"
    )


async def test_the_link_goes_to_a_configured_origin_whatever_origin_asked(tv):
    assert (await requested(tv, Origin="https://evil.example"))[
        "verificationUri"
    ] == "http://localhost:5173/link"
    assert (await requested(tv, Origin="http://localhost:3000"))[
        "verificationUri"
    ] == "http://localhost:3000/link"


async def test_an_origin_only_a_wildcard_rule_allows_is_not_where_a_person_is_sent(
    monkeypatch, clock
):
    from app.factory import create_app
    from app.settings import Settings

    env = worker_env()
    wild = create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test",
            session_secret="s",
            cors_origins=["https://graspy.example", "https://*.graspy.pages.dev"],
            _env_file=None,
        ),
        voice=env,
    )
    async with client(wild) as http:
        request = await requested(http, Origin="https://evil.graspy.pages.dev")

    assert request["verificationUri"] == "https://graspy.example/link"


async def test_neither_code_is_kept_in_the_clear(app, tv):
    request = await requested(tv, **{"CF-Connecting-IP": "198.51.100.7"})

    (row,) = rows(app, "tv_links")
    stored = " ".join(str(value) for value in row.values())
    assert request["deviceCode"] not in stored
    assert request["userCode"] not in stored
    assert "198.51.100.7" not in stored
    assert row["label"] == "Samsung TV"
    assert row["status"] == "pending"


async def test_a_request_is_labelled_with_the_country_cloudflare_names(app, tv):
    await requested(tv, **{"CF-IPCountry": "ng"})
    await requested(tv, **{"CF-IPCountry": "XX"})

    assert [row["country"] for row in rows(app, "tv_links")] == ["NG", "XX"]


# The TV's polling


async def test_a_request_nobody_has_answered_is_pending(tv):
    assert await polled(tv, await requested(tv)) == {
        "status": "pending",
        "interval": 5,
    }


async def test_a_poll_that_comes_too_soon_is_told_to_slow_down_and_the_interval_grows(
    tv, clock
):
    request = await requested(tv)
    await polled(tv, request)

    clock.advance(1)
    slowed = await polled(tv, request)
    clock.advance(1)
    slower = await polled(tv, request)

    assert slowed["status"] == "slow_down"
    assert slowed["interval"] == 10
    assert slower["interval"] == 15
    clock.advance(15)
    assert (await polled(tv, request))["status"] == "pending"


async def test_the_interval_stops_growing_at_its_cap(tv, clock):
    request = await requested(tv)
    await polled(tv, request)
    for _ in range(10):
        clock.advance(0.1)
        slowed = await polled(tv, request)

    assert slowed["interval"] == tv_links.MAX_INTERVAL_S


async def test_a_poll_a_little_early_for_network_jitter_is_still_on_time(tv, clock):
    request = await requested(tv)
    await polled(tv, request)
    clock.advance(4.2)

    assert (await polled(tv, request))["status"] == "pending"


async def test_an_unknown_device_code_reads_as_expired(tv):
    response = await tv.post(TOKEN, json={"deviceCode": "x" * 43})

    assert response.json() == {"status": "expired"}


async def test_a_device_code_that_is_malformed_is_refused(tv):
    assert (await tv.post(TOKEN, json={"deviceCode": "short"})).status_code == 422
    assert (await tv.post(TOKEN, json={})).status_code == 422


async def test_a_request_expires_after_ten_minutes_for_the_tv_and_the_phone(
    tv, phone, clock
):
    request = await requested(tv)

    clock.advance(10 * 60 - 1)
    assert (await polled(tv, request))["status"] == "pending"
    clock.advance(2)
    assert (await polled(tv, request))["status"] == "expired"
    assert (await looked_up(phone, request)).status_code == 404
    assert (await approved(phone, request)).status_code == 404


async def test_an_approval_that_the_tv_was_too_late_to_take_has_expired_too(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)

    clock.advance(11 * 60)

    assert (await polled(tv, request))["status"] == "expired"
    assert (await continued(tv, request)) == {"status": "expired"}
    assert rows(app, "tv_sessions") == []


# The phone looks, approves or denies


async def test_the_phone_sees_what_it_is_asked_to_approve_and_not_the_code(
    tv, phone, clock
):
    request = await requested(tv, **{"CF-IPCountry": "NG"})
    clock.advance(30)

    seen = await looked_up(phone, request)

    assert seen.status_code == 200
    assert seen.json() == {
        "label": "Samsung TV",
        "country": "NG",
        "createdAt": BASE,
        "expiresAt": BASE + 600_000,
    }
    assert request["deviceCode"] not in seen.text
    assert last_four(request) not in seen.text


async def test_the_phone_may_type_the_code_in_lower_case_with_a_dash(tv, phone):
    request = await requested(tv)
    typed = request["userCode"][:4].lower() + "-" + request["userCode"][4:]

    assert (await phone.post(LOOKUP, json={"userCode": typed})).status_code == 200


async def test_a_code_that_names_no_request_is_not_found_whatever_is_wrong_with_it(
    tv, phone
):
    request = await requested(tv)
    wrong = "AAAAAAAA" if request["userCode"] != "AAAAAAAA" else "BBBBBBBB"

    for typed in (wrong, "short", "0000-0000", "é" * 8):
        response = await phone.post(LOOKUP, json={"userCode": typed})
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "code_not_found"


async def test_a_tv_is_signed_in_only_when_the_person_at_it_continues(
    app, tv, phone, clock
):
    request = await requested(tv)
    assert (await approved(phone, request)).status_code == 204
    clock.advance(5)

    linking = await polled(tv, request)

    assert linking["status"] == "linking"
    assert linking["learner"]["id"] == phone.learner
    assert linking["learner"]["name"] == "Ada"
    assert "token" not in linking
    assert "refreshToken" not in linking
    assert rows(app, "tv_sessions") == []
    clock.advance(5)
    assert (await polled(tv, request))["status"] == "linking"
    assert rows(app, "tv_sessions") == []

    answer = await continued(tv, request)

    assert answer["status"] == "approved"
    claims = verify(answer["token"], "s")
    assert claims["acct"] == UID
    assert claims["sub"] == learner_key(UID, phone.learner)
    assert tv_of(claims)
    assert answer["learner"]["id"] == phone.learner
    assert answer["account"] == UID
    assert answer["refreshToken"]
    assert answer["expiresIn"] == TV_TOKEN_TTL_SECONDS == 3600
    assert len(rows(app, "tv_sessions")) == 1


async def test_the_person_at_the_tv_can_decline_and_no_session_is_ever_made(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)

    cancelled = await tv.post(CANCEL, json={"deviceCode": request["deviceCode"]})
    clock.advance(5)

    assert cancelled.status_code == 204
    assert (await polled(tv, request))["status"] == "denied"
    assert await continued(tv, request) == {"status": "expired"}
    assert rows(app, "tv_sessions") == []


async def test_a_tv_that_gives_up_its_request_ends_it_for_the_phone_too(tv, phone):
    request = await requested(tv)

    await tv.post(CANCEL, json={"deviceCode": request["deviceCode"]})

    assert (await looked_up(phone, request)).status_code == 404


async def test_a_cancel_after_the_session_was_taken_changes_nothing(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    answer = await continued(tv, request)

    await tv.post(CANCEL, json={"deviceCode": request["deviceCode"]})

    renewed = await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    assert renewed.status_code == 200


async def test_continuing_before_the_phone_approved_gives_nothing(app, tv):
    request = await requested(tv)

    assert await continued(tv, request) == {"status": "expired"}
    assert rows(app, "tv_sessions") == []


async def test_a_second_continue_and_a_replayed_device_code_get_nothing(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    first = await continued(tv, request)

    async with client(app) as thief:
        stolen = await continued(thief, request)
        polled_again = await polled(thief, request)

    assert first["status"] == "approved"
    assert stolen == {"status": "expired"}
    assert polled_again == {"status": "expired"}
    assert len(rows(app, "tv_sessions")) == 1


async def test_two_continues_at_once_make_one_session(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)

    answers = await asyncio.gather(*(continued(tv, request) for _ in range(6)))

    assert (
        sorted(answer["status"] for answer in answers) == ["approved"] + ["expired"] * 5
    )
    assert len(rows(app, "tv_sessions")) == 1


async def test_two_takes_at_once_make_one_session(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)

    taken = await asyncio.gather(
        *(
            tv_sessions.take(app.state.tv_db, request["deviceCode"], clock.ms)
            for _ in range(6)
        )
    )

    assert [one is not None for one in taken].count(True) == 1
    assert len(rows(app, "tv_sessions")) == 1


async def test_denying_tells_the_tv_and_nothing_can_approve_it_after(tv, phone, clock):
    request = await requested(tv)
    await looked_up(phone, request)

    denied = await phone.post(DENY, json={"userCode": request["userCode"]})
    clock.advance(5)

    assert denied.status_code == 204
    assert (await polled(tv, request))["status"] == "denied"
    assert (await approved(phone, request)).status_code == 404


async def test_a_second_approval_of_a_request_is_refused(tv, phone):
    request = await requested(tv)

    first = await approved(phone, request)
    second = await approved(phone, request)

    assert (first.status_code, second.status_code) == (204, 404)


async def test_two_approvals_at_once_have_one_winner(app, tv, phone):
    request = await requested(tv)
    await looked_up(phone, request)
    body = {
        "userCode": request["userCode"],
        "learnerId": phone.learner,
        "confirm": last_four(request),
    }

    answers = await asyncio.gather(*(phone.post(APPROVE, json=body) for _ in range(5)))

    assert sorted(answer.status_code for answer in answers) == [204, 404, 404, 404, 404]
    (row,) = rows(app, "tv_links")
    assert row["account_uid"] == UID


async def test_the_guarded_approve_lets_one_of_two_writes_win(app, tv, phone):
    request = await requested(tv)
    link = await looked_up(phone, request)
    assert link.status_code == 200
    (row,) = rows(app, "tv_links")

    won, lost = await asyncio.gather(
        tv_links.approve(app.state.tv_db, row["id"], UID, "a", BASE),
        tv_links.approve(app.state.tv_db, row["id"], UID, "b", BASE),
    )

    assert sorted([won, lost]) == [False, True]


async def test_a_denial_after_an_approval_changes_nothing(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)

    assert (
        await phone.post(DENY, json={"userCode": request["userCode"]})
    ).status_code == 404
    clock.advance(5)
    assert (await polled(tv, request))["status"] == "linking"


async def test_a_learner_the_account_does_not_hold_cannot_be_approved(tv, phone):
    request = await requested(tv)

    refused = await approved(phone, request, learner="0123456789ab")

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"
    assert (await approved(phone, request)).status_code == 204


async def test_only_a_signed_in_account_can_look_up_approve_or_deny(tv):
    request = await requested(tv)
    body = {"userCode": request["userCode"]}

    for path, sent in (
        (LOOKUP, body),
        (APPROVE, {**body, "learnerId": "0123456789ab", "confirm": "ABCD"}),
        (DENY, body),
    ):
        assert (await tv.post(path, json=sent)).status_code == 401
    assert (await tv.get(DEVICES)).status_code == 401


# The parent's, and no one else's


async def test_a_childs_session_cannot_look_up_approve_deny_list_or_remove(app, tv):
    request = await requested(tv)
    async with client(app) as child:
        await signed_in(child, firebaseIdToken="good")
        learner = await add_learner(child, "Ada", "fresh")
        await chosen(child, learner)
        body = {"userCode": request["userCode"]}

        results = [
            await child.post(LOOKUP, json=body),
            await child.post(
                APPROVE,
                json={**body, "learnerId": learner, "confirm": last_four(request)},
            ),
            await child.post(DENY, json=body),
            await child.get(DEVICES),
            await child.delete(f"{DEVICES}/anything"),
        ]

    assert [one.status_code for one in results] == [403] * 5
    assert {one.json()["detail"]["code"] for one in results} == {"account_required"}
    assert rows(app, "tv_links")[0]["status"] == "pending"
    assert rows(app, "tv_links")[0]["attempts"] == 0


async def test_an_account_session_that_did_not_just_sign_in_is_not_a_parent(app, tv):
    request = await requested(tv)
    async with client(app) as stale:
        await signed_in(stale, firebaseIdToken="good")

        refused = await stale.post(LOOKUP, json={"userCode": request["userCode"]})

    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "account_required"


async def test_a_tv_cannot_sign_another_tv_in_or_manage_the_account(
    app, tv, phone, clock
):
    use(tv, await signed_in_tv(tv, phone, clock))
    other = await requested(client(app))

    for path in (LOOKUP, DENY):
        refused = await tv.post(path, json={"userCode": other["userCode"]})
        assert refused.status_code == 403
    assert (await tv.get(DEVICES)).status_code == 403
    assert (await tv.delete("/api/account")).status_code == 403


def tv_forbidden_routes(app) -> list[tuple[str, str]]:
    """Every route of the account and of the phone's side of TV sign-in, but not the TV's own
    (which carry a secret instead of a session) and not the TV's read of its own learner."""
    own = {
        (f"{START}", "POST"),
        (TOKEN, "POST"),
        (CONTINUE, "POST"),
        (CANCEL, "POST"),
        (SESSION, "POST"),
        (SIGN_OUT, "POST"),
        ("/api/account/learners", "GET"),
    }
    found = []
    for path, methods in app.openapi()["paths"].items():
        if not path.startswith(("/api/account", START)):
            continue
        for method in methods:
            if (path, method.upper()) not in own:
                found.append((method.upper(), path))
    return found


def filled(path: str) -> str:
    """A value for every path parameter, one every pattern of the routes accepts."""
    return re.sub(r"\{[^}]+\}", "0123456789ab", path)


async def test_every_account_route_refuses_a_tv_session_but_its_own_learners(
    app, tv, phone, clock
):
    use(tv, await signed_in_tv(tv, phone, clock))
    routes = tv_forbidden_routes(app)
    assert ("POST", f"{APPROVE}") in routes
    assert ("DELETE", "/api/tv-sign-in/devices/{device_id}") in routes
    assert ("POST", "/api/account/learners") in routes
    assert ("PUT", "/api/account/learners/{learner_id}/consent") in routes
    assert ("DELETE", "/api/account/learners/{learner_id}") in routes
    assert ("DELETE", "/api/account") in routes
    assert any("/voice" in path for _, path in routes)

    allowed = []
    for method, path in routes:
        response = await tv.request(method, filled(path), json={})
        if response.status_code != 403:
            allowed.append((method, path, response.status_code))

    assert allowed == []


async def test_a_tv_can_read_who_it_learns_as_and_nobody_else_of_the_account(
    app, tv, phone, clock
):
    other = await phone.post(
        "/api/account/learners",
        json={
            "name": "Ben",
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": "fresh"},
        },
    )
    assert other.status_code == 201
    use(tv, await signed_in_tv(tv, phone, clock))

    listed = (await tv.get("/api/account/learners")).json()["learners"]

    assert [one["id"] for one in listed] == [phone.learner]


async def test_the_session_the_tv_takes_works_as_the_learner_and_only_as_them(
    app, tv, phone, clock
):
    keeping = app.state.keeping
    use(tv, await signed_in_tv(tv, phone, clock))

    first = await tv.post("/api/learner/import", json={})
    again = await tv.post("/api/learner/import", json={})

    assert (first.status_code, first.json()) == (200, {"imported": True})
    assert again.json() == {"imported": False}
    assert (await keeping.learners.load(learner_key(UID, phone.learner))).imported
    assert not (await keeping.learners.load(account_key(UID))).imported
    assert (await tv.get("/api/learner", params={"planId": "p"})).status_code == 200


# Holding a request, and the confirmation


async def test_the_account_that_looks_a_code_up_holds_it_and_another_is_turned_away(
    tv, phone, other_phone
):
    request = await requested(tv)
    assert (await looked_up(phone, request)).status_code == 200

    turned_away = await looked_up(other_phone, request)

    assert turned_away.status_code == 409
    assert turned_away.json()["detail"]["code"] == "code_in_use"
    assert (await looked_up(phone, request)).status_code == 200


async def test_an_account_that_did_not_look_the_code_up_cannot_approve_or_deny_it(
    app, tv, phone, other_phone
):
    request = await requested(tv)
    await looked_up(phone, request)
    body = {
        "userCode": request["userCode"],
        "learnerId": other_phone.learner,
        "confirm": last_four(request),
    }

    approving = await other_phone.post(APPROVE, json=body)
    denying = await other_phone.post(DENY, json={"userCode": request["userCode"]})

    assert (approving.status_code, denying.status_code) == (404, 404)
    assert rows(app, "tv_links")[0]["status"] == "pending"


async def test_nobody_can_approve_a_code_they_never_looked_up(tv, phone):
    request = await requested(tv)

    refused = await phone.post(
        APPROVE,
        json={
            "userCode": request["userCode"],
            "learnerId": phone.learner,
            "confirm": last_four(request),
        },
    )

    assert refused.status_code == 404


async def test_a_hold_lasts_two_minutes_then_another_account_may_take_it(
    tv, phone, other_phone, clock
):
    request = await requested(tv)
    await looked_up(phone, request)

    clock.advance(119)
    assert (await looked_up(other_phone, request)).status_code == 409
    clock.advance(2)

    assert (await looked_up(other_phone, request)).status_code == 200
    late = await phone.post(
        APPROVE,
        json={
            "userCode": request["userCode"],
            "learnerId": phone.learner,
            "confirm": last_four(request),
        },
    )
    assert late.status_code == 404


async def test_an_approval_after_the_hold_ran_out_needs_another_lookup(
    tv, phone, clock
):
    request = await requested(tv)
    await looked_up(phone, request)
    clock.advance(121)
    body = {
        "userCode": request["userCode"],
        "learnerId": phone.learner,
        "confirm": last_four(request),
    }

    assert (await phone.post(APPROVE, json=body)).status_code == 404
    await looked_up(phone, request)
    assert (await phone.post(APPROVE, json=body)).status_code == 204


async def test_an_approval_needs_the_last_four_characters_as_the_tv_shows_them(
    tv, phone, clock
):
    request = await requested(tv)
    await looked_up(phone, request)
    body = {"userCode": request["userCode"], "learnerId": phone.learner}

    for wrong in ("AAAA", request["userCode"][:4], ""):
        refused = await phone.post(APPROVE, json={**body, "confirm": wrong})
        assert refused.status_code == 403
        assert refused.json()["detail"]["code"] == "confirm_mismatch"
    assert (await phone.post(APPROVE, json=body)).status_code == 422
    clock.advance(5)
    assert (await polled(tv, request))["status"] == "pending"

    typed = last_four(request).lower()
    assert (
        await phone.post(APPROVE, json={**body, "confirm": typed})
    ).status_code == 204


async def test_wrong_confirmations_count_and_the_tenth_attempt_ends_the_request(
    tv, phone, clock
):
    request = await requested(tv)
    await looked_up(phone, request)
    body = {
        "userCode": request["userCode"],
        "learnerId": phone.learner,
        "confirm": "AAAA" if last_four(request) != "AAAA" else "BBBB",
    }

    for _ in range(tv_links.MAX_ATTEMPTS - 2):
        assert (await phone.post(APPROVE, json=body)).status_code == 403
    ended = await phone.post(APPROVE, json=body)
    clock.advance(5)

    assert ended.status_code == 404
    assert (await approved(phone, request)).status_code == 404
    assert (await polled(tv, request))["status"] == "denied"


async def test_the_tenth_lookup_of_a_code_ends_the_request(tv, phone, clock):
    request = await requested(tv)
    body = {"userCode": request["userCode"]}

    for _ in range(tv_links.MAX_ATTEMPTS - 1):
        assert (await phone.post(LOOKUP, json=body)).status_code == 200
    ended = await phone.post(LOOKUP, json=body)
    clock.advance(5)

    assert ended.status_code == 404
    assert (await polled(tv, request))["status"] == "denied"


async def test_a_learner_without_a_parents_agreement_cannot_be_signed_in_on_a_tv(
    tv, phone
):
    bare = (
        await phone.post("/api/account/learners", json={"name": "Cy", "guardian": True})
    ).json()["id"]
    request = await requested(tv)

    refused = await approved(phone, request, learner=bare)

    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "consent_required"


async def test_a_learner_removed_while_the_tv_waits_is_not_linked(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)
    await phone.delete(f"/api/account/learners/{phone.learner}")
    clock.advance(5)

    assert (await polled(tv, request))["status"] == "denied"
    assert await continued(tv, request) == {"status": "expired"}
    assert rows(app, "tv_sessions") == []


async def test_a_consent_store_that_cannot_be_read_does_not_end_the_request(
    app, tv, phone, clock, monkeypatch
):
    from fastapi import HTTPException

    from app.api import tv_sign_in_routes

    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    real = tv_sign_in_routes.service_consent_refusal
    reading = {"works": False}

    async def sometimes(application, key):
        if reading["works"]:
            return await real(application, key)
        return HTTPException(
            status_code=503, detail={"error": "later", "code": "consent_unavailable"}
        )

    monkeypatch.setattr(tv_sign_in_routes, "service_consent_refusal", sometimes)
    body = {"deviceCode": request["deviceCode"]}
    assert (await tv.post(TOKEN, json=body)).status_code == 503
    assert (await tv.post(CONTINUE, json=body)).status_code == 503

    assert rows(app, "tv_links")[0]["status"] == "approved"
    assert rows(app, "tv_sessions") == []
    reading["works"] = True
    assert (await continued(tv, request))["status"] == "approved"


# Another account


async def test_the_session_a_tv_takes_belongs_to_the_account_that_approved_it(
    tv, other_phone, clock
):
    request = await requested(tv)
    assert (await approved(other_phone, request)).status_code == 204
    clock.advance(5)
    await polled(tv, request)

    answer = await continued(tv, request)

    assert verify(answer["token"], "s")["acct"] == OTHER_UID
    assert answer["account"] == OTHER_UID


async def test_an_account_cannot_approve_for_a_learner_of_another_account(
    tv, phone, other_phone
):
    request = await requested(tv)

    refused = await approved(other_phone, request, learner=phone.learner)

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"


async def test_an_account_cannot_list_or_remove_another_accounts_tvs(
    tv, phone, other_phone, clock
):
    await signed_in_tv(tv, phone, clock)
    (listed,) = (await phone.get(DEVICES)).json()["devices"]

    others = (await other_phone.get(DEVICES)).json()
    removed = await other_phone.delete(f"{DEVICES}/{listed['id']}")

    assert others == {"devices": []}
    assert removed.status_code == 404
    assert (await phone.get(DEVICES)).json()["devices"] == [listed]


# Renewing, rotating, listing and revoking


async def renew(tv, token: str):
    return await tv.post(SESSION, json={"refreshToken": token})


async def test_the_tv_renews_its_session_and_gets_a_new_credential(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(3000)

    renewed = await renew(tv, answer["refreshToken"])

    assert renewed.status_code == 200
    body = renewed.json()
    assert body["signedIn"] is True
    assert body["learner"]["id"] == phone.learner
    assert body["expiresIn"] == TV_TOKEN_TTL_SECONDS
    assert body["refreshToken"] != answer["refreshToken"]
    assert tv_of(verify(body["token"], "s")) == tv_of(verify(answer["token"], "s"))
    assert (await renew(tv, body["refreshToken"])).status_code == 200


async def test_a_credential_is_kept_only_as_a_hash_and_so_is_the_next(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    renewed = (await renew(tv, answer["refreshToken"])).json()

    (row,) = rows(app, "tv_sessions")
    stored = " ".join(str(v) for v in row.values())
    assert answer["refreshToken"] not in stored
    assert renewed["refreshToken"] not in stored
    assert row["refresh_hash"] == hash_secret(renewed["refreshToken"])
    assert row["prev_hash"] == hash_secret(answer["refreshToken"])


async def test_a_replaced_credential_after_the_grace_is_a_copy_and_revokes_the_whole_tv(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    newer = (await renew(tv, answer["refreshToken"])).json()
    clock.advance(61)

    thief = await renew(tv, answer["refreshToken"])

    assert thief.status_code == 401
    assert (await renew(tv, newer["refreshToken"])).status_code == 401
    assert (await phone.get(DEVICES)).json() == {"devices": []}
    assert rows(app, "tv_sessions")[0]["revoked_at"] is not None


def test_the_successor_is_made_with_a_key_derived_from_the_secret_not_the_secret_itself():
    import base64
    import hmac

    naive = hmac.new(b"s", b"tv-next:old", "sha256").digest()

    assert successor_of("old", "s") != base64.urlsafe_b64encode(naive).decode().rstrip(
        "="
    )


def test_the_successor_of_a_credential_is_the_same_each_time_and_needs_the_secret():
    assert successor_of("old", "s") == successor_of("old", "s")
    assert successor_of("old", "s") != successor_of("old", "t")
    assert successor_of("old", "s") != successor_of("older", "s")
    assert len(successor_of("old", "s")) >= 20


async def test_a_lost_answer_is_answered_again_with_the_same_successor_twice_in_a_row(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    first = (await renew(tv, answer["refreshToken"])).json()
    clock.advance(20)
    again = (await renew(tv, answer["refreshToken"])).json()
    clock.advance(20)
    third = (await renew(tv, answer["refreshToken"])).json()

    assert first["refreshToken"] == again["refreshToken"] == third["refreshToken"]
    assert len(rows(app, "tv_sessions")) == 1
    assert (await phone.get(DEVICES)).json()["devices"]


async def test_the_credential_the_first_caller_received_is_still_the_current_one_after_a_redelivery(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    first = (await renew(tv, answer["refreshToken"])).json()
    clock.advance(5)
    await renew(tv, answer["refreshToken"])

    renewed = await renew(tv, first["refreshToken"])

    assert renewed.status_code == 200
    assert rows(app, "tv_sessions")[0]["revoked_at"] is None


async def test_a_replaced_credential_presented_a_third_time_within_the_grace_revokes_the_tv(
    tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    await renew(tv, answer["refreshToken"])
    for _ in range(tv_sessions.GRACE_REDELIVERIES):
        clock.advance(1)
        assert (await renew(tv, answer["refreshToken"])).status_code == 200
    clock.advance(1)

    assert (await renew(tv, answer["refreshToken"])).status_code == 401
    assert (await phone.get(DEVICES)).json() == {"devices": []}


async def test_a_credential_two_generations_old_revokes_the_tv(tv, phone, clock):
    first = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    second = (await renew(tv, first["refreshToken"])).json()
    clock.advance(10)
    third = (await renew(tv, second["refreshToken"])).json()
    clock.advance(1)

    assert (await renew(tv, first["refreshToken"])).status_code == 401
    assert (await renew(tv, third["refreshToken"])).status_code == 401


async def test_two_tabs_renewing_at_once_end_with_one_successor(app, tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)

    both = await asyncio.gather(
        renew(tv, answer["refreshToken"]), renew(tv, answer["refreshToken"])
    )

    assert [one.status_code for one in both] == [200, 200]
    assert both[0].json()["refreshToken"] == both[1].json()["refreshToken"]
    assert rows(app, "tv_sessions")[0]["revoked_at"] is None
    assert (await renew(tv, both[0].json()["refreshToken"])).status_code == 200


async def test_a_renewal_that_fails_with_a_503_does_not_use_up_the_credential(
    app, tv, phone, clock, monkeypatch
):
    from fastapi import HTTPException

    from app.api import tv_sign_in_routes

    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(10)
    before = rows(app, "tv_sessions")[0]
    real = tv_sign_in_routes.service_consent_refusal
    reading = {"works": False}

    async def sometimes(application, key):
        if reading["works"]:
            return await real(application, key)
        return HTTPException(
            status_code=503, detail={"error": "later", "code": "consent_unavailable"}
        )

    monkeypatch.setattr(tv_sign_in_routes, "service_consent_refusal", sometimes)

    failed = await renew(tv, answer["refreshToken"])
    after = rows(app, "tv_sessions")[0]
    reading["works"] = True
    retried = await renew(tv, answer["refreshToken"])

    assert failed.status_code == 503
    assert after["refresh_hash"] == before["refresh_hash"]
    assert after["prev_hash"] == before["prev_hash"]
    assert retried.status_code == 200
    assert rows(app, "tv_sessions")[0]["revoked_at"] is None
    assert (await renew(tv, retried.json()["refreshToken"])).status_code == 200


async def test_a_credential_nobody_issued_is_refused_and_revokes_nothing(
    tv, phone, clock
):
    await signed_in_tv(tv, phone, clock)

    refused = await renew(tv, "r" * 43)

    assert refused.status_code == 401
    assert refused.json()["detail"]["code"] == "tv_revoked"
    assert len((await phone.get(DEVICES)).json()["devices"]) == 1


async def test_the_account_lists_its_tvs_and_revokes_one(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    (listed,) = (await phone.get(DEVICES)).json()["devices"]
    assert listed["label"] == "Samsung TV"
    assert listed["learner"]["id"] == phone.learner
    assert set(listed) == {"id", "label", "learner", "createdAt", "lastUsedAt"}
    removed = await phone.delete(f"{DEVICES}/{listed['id']}")

    assert removed.status_code == 204
    assert (await phone.get(DEVICES)).json() == {"devices": []}
    assert (await renew(tv, answer["refreshToken"])).status_code == 401
    assert (await phone.delete(f"{DEVICES}/{listed['id']}")).status_code == 404


async def test_a_credential_ends_after_thirty_days_unused(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(30 * 86400 - 60)
    renewed = (await renew(tv, answer["refreshToken"])).json()

    clock.advance(30 * 86400 + 60)

    assert (await renew(tv, renewed["refreshToken"])).status_code == 401


async def test_a_credential_in_daily_use_still_ends_after_ninety_days(tv, phone, clock):
    token = (await signed_in_tv(tv, phone, clock))["refreshToken"]
    for _ in range(89):
        clock.advance(86400)
        renewed = await renew(tv, token)
        assert renewed.status_code == 200
        token = renewed.json()["refreshToken"]

    clock.advance(2 * 86400)

    assert (await renew(tv, token)).status_code == 401


async def test_the_tv_signing_out_revokes_its_credential(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    out = await tv.post(SIGN_OUT, json={"refreshToken": answer["refreshToken"]})

    assert out.status_code == 204
    assert (await phone.get(DEVICES)).json() == {"devices": []}
    assert (await renew(tv, answer["refreshToken"])).status_code == 401
    assert (await tv.post(SIGN_OUT, json={"refreshToken": "z" * 43})).status_code == 204


async def test_a_tv_whose_learner_was_removed_is_revoked_when_it_renews(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    await phone.delete(f"/api/account/learners/{phone.learner}")

    refused = await renew(tv, answer["refreshToken"])

    assert refused.status_code == 404
    assert rows(app, "tv_sessions")[0]["revoked_at"] is not None


async def test_an_account_holds_at_most_ten_tvs(tv, phone, clock):
    for _ in range(tv_sessions.MAX_TVS_PER_ACCOUNT):
        await signed_in_tv(tv, phone, clock)
    request = await requested(tv)

    refused = await approved(phone, request)

    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "too_many_tvs"
    (listed, *_) = (await phone.get(DEVICES)).json()["devices"]
    await phone.delete(f"{DEVICES}/{listed['id']}")
    assert (await approved(phone, request)).status_code == 204


async def test_deleting_the_account_removes_its_tvs(app, tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    assert (await phone.delete("/api/account")).status_code == 204

    assert rows(app, "tv_sessions") == []
    assert (await renew(tv, answer["refreshToken"])).status_code == 401


# Starting a request: limits


class Budget:
    def __init__(self, allowed: bool = True, refuses: str = "") -> None:
        self.allowed, self.refuses, self.keys = allowed, refuses, []

    async def allow(self, key: str) -> bool:
        self.keys.append(key)
        return self.allowed and not (self.refuses and key.startswith(self.refuses))


def test_a_source_is_an_ipv4_address_or_the_64_of_an_ipv6_one():
    assert source_of("198.51.100.7") == "198.51.100.7"
    assert source_of("2001:db8:1:2:aaaa:bbbb:cccc:dddd") == "2001:db8:1:2::/64"
    assert source_of("2001:db8:1:2::1") == source_of("2001:db8:1:2:ffff::9")
    assert source_of("2001:db8:1:3::1") != source_of("2001:db8:1:2::1")
    assert source_of("unknown") == "unknown"


async def test_asking_for_a_code_spends_the_pairing_budget_of_the_source(app, tv):
    app.state.pairing_limiter = budget = Budget()

    await requested(tv, **{"CF-Connecting-IP": "198.51.100.7"})
    await requested(tv, **{"CF-Connecting-IP": "2001:db8:1:2:aaaa::1"})

    assert budget.keys == [
        "tv-start:198.51.100.7",
        "tv-start-prefix:198.51.100.0/24",
        "tv-start:2001:db8:1:2::/64",
        "tv-start-prefix:2001:db8:1::/48",
    ]


async def test_a_spent_budget_refuses_a_request_with_a_retry_after(app, tv):
    app.state.pairing_limiter = Budget(allowed=False)

    refused = await tv.post(START)

    assert refused.status_code == 429
    assert refused.headers["retry-after"] == "60"
    assert refused.json()["detail"]["code"] == "rate_limited"
    assert rows(app, "tv_links") == []


async def test_one_source_holds_only_a_few_requests_open_and_is_told_to_slow_down(
    app, tv
):
    here = {"CF-Connecting-IP": "198.51.100.7"}
    for _ in range(tv_links.MAX_OPEN_PER_SOURCE):
        await requested(tv, **here)

    refused = await tv.post(START, headers=here)

    assert refused.status_code == 429
    assert refused.json()["detail"]["code"] == "rate_limited"
    assert len(rows(app, "tv_links")) == tv_links.MAX_OPEN_PER_SOURCE
    assert (await requested(tv, **{"CF-Connecting-IP": "198.51.100.8"}))["userCode"]


async def test_addresses_in_one_ipv6_64_are_one_source(app, tv):
    for index in range(tv_links.MAX_OPEN_PER_SOURCE):
        await requested(tv, **{"CF-Connecting-IP": f"2001:db8:1:2::{index + 1:x}"})

    refused = await tv.post(START, headers={"CF-Connecting-IP": "2001:db8:1:2:ffff::1"})

    assert refused.status_code == 429
    other = await tv.post(START, headers={"CF-Connecting-IP": "2001:db8:1:3::1"})
    assert other.status_code == 201


async def test_starts_at_once_from_one_source_stop_at_the_cap(app, tv):
    here = {"CF-Connecting-IP": "198.51.100.7"}

    answers = await asyncio.gather(*(tv.post(START, headers=here) for _ in range(20)))

    statuses = sorted(answer.status_code for answer in answers)
    assert statuses.count(201) == tv_links.MAX_OPEN_PER_SOURCE
    assert statuses.count(429) == 20 - tv_links.MAX_OPEN_PER_SOURCE
    assert len(rows(app, "tv_links")) == tv_links.MAX_OPEN_PER_SOURCE


async def test_starts_at_once_from_many_sources_stop_at_the_global_cap(
    app, tv, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_OPEN_LINKS", 5)

    answers = await asyncio.gather(
        *(
            tv.post(START, headers={"CF-Connecting-IP": f"198.51.100.{i}"})
            for i in range(12)
        )
    )

    statuses = [answer.status_code for answer in answers]
    assert statuses.count(201) == 5
    assert statuses.count(503) == 7
    assert len(rows(app, "tv_links")) == 5


async def test_the_global_cap_counts_only_open_requests(
    app, tv, phone, clock, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_OPEN_LINKS", 2)
    first = await requested(tv, **{"CF-Connecting-IP": "198.51.100.1"})
    await requested(tv, **{"CF-Connecting-IP": "198.51.100.2"})
    full = await tv.post(START, headers={"CF-Connecting-IP": "198.51.100.3"})
    assert full.status_code == 503
    assert full.json()["detail"]["code"] == "tv_sign_in_busy"

    await tv.post(CANCEL, json={"deviceCode": first["deviceCode"]})
    assert (
        await tv.post(START, headers={"CF-Connecting-IP": "198.51.100.3"})
    ).status_code == 201

    clock.advance(11 * 60)
    for index in range(2):
        response = await tv.post(
            START, headers={"CF-Connecting-IP": f"198.51.100.{10 + index}"}
        )
        assert response.status_code == 201


async def test_a_denied_consumed_or_expired_request_does_not_count_toward_either_cap(
    app, tv, phone, clock, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_OPEN_PER_SOURCE", 1)
    here = {"CF-Connecting-IP": "198.51.100.7"}
    request = await requested(tv, **here)
    await approved(phone, request)
    clock.advance(5)
    await continued(tv, request)

    assert (await tv.post(START, headers=here)).status_code == 201


async def test_a_source_is_told_to_slow_down_before_everyone_is_told_it_is_full(
    app, tv, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_OPEN_LINKS", 1)
    monkeypatch.setattr(tv_links, "MAX_OPEN_PER_SOURCE", 1)
    here = {"CF-Connecting-IP": "198.51.100.7"}
    await requested(tv, **here)

    same_source = await tv.post(START, headers=here)
    another = await tv.post(START, headers={"CF-Connecting-IP": "198.51.100.8"})

    assert (same_source.status_code, another.status_code) == (429, 503)


def test_the_pairing_budget_cannot_be_left_out_of_the_budgets():
    one = Budget()

    with pytest.raises(TypeError):
        Budgets(session=one, generate=one, agent=one, api=one)


# Lookups: limits


async def test_looking_a_code_up_spends_the_budget_of_the_account_and_the_source(
    app, tv, phone
):
    request = await requested(tv)
    app.state.pairing_limiter = budget = Budget()

    await phone.post(
        LOOKUP,
        json={"userCode": request["userCode"]},
        headers={"CF-Connecting-IP": "198.51.100.8"},
    )

    assert budget.keys == [f"tv-look:{UID}", "tv-look-ip:198.51.100.8"]


async def test_a_spent_budget_stops_guessing_before_the_code_is_read(app, tv, phone):
    request = await requested(tv)
    app.state.pairing_limiter = Budget(allowed=False)

    refused = await phone.post(LOOKUP, json={"userCode": request["userCode"]})

    assert refused.status_code == 429
    assert rows(app, "tv_links")[0]["attempts"] == 0


async def test_wrong_guesses_have_budgets_of_their_own_per_account_and_per_source(
    app, tv, phone
):
    request = await requested(tv)
    app.state.pairing_limiter = budget = Budget(refuses="tv-miss-ip")
    wrong = "AAAAAAAA" if request["userCode"] != "AAAAAAAA" else "BBBBBBBB"

    guess = await phone.post(
        LOOKUP, json={"userCode": wrong}, headers={"CF-Connecting-IP": "198.51.100.8"}
    )
    right = await looked_up(phone, request)

    assert guess.status_code == 429
    assert budget.keys[:4] == [
        f"tv-look:{UID}",
        "tv-look-ip:198.51.100.8",
        f"tv-miss:{UID}",
        "tv-miss-ip:198.51.100.8",
    ]
    assert right.status_code == 200
    assert not any(key.startswith("tv-miss") for key in budget.keys[4:])


async def test_a_wrong_guess_inside_its_budget_is_a_plain_not_found(app, tv, phone):
    app.state.pairing_limiter = Budget()

    refused = await phone.post(LOOKUP, json={"userCode": "AAAAAAAA"})

    assert refused.status_code == 404


# Clean-up


class Env:
    def __init__(self, database) -> None:
        self.DB = database


async def test_expired_requests_and_ended_credentials_are_purged(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    await continued(tv, request)
    (listed,) = (await phone.get(DEVICES)).json()["devices"]
    await phone.delete(f"{DEVICES}/{listed['id']}")
    env = Env(app.state.tv_db)

    clock.advance(2 * 3600)
    current = await requested(tv)
    await tv_sessions.purge_tv_sign_in(env, clock.ms)

    assert [row["status"] for row in rows(app, "tv_links")] == ["pending"]
    assert current["userCode"]
    assert len(rows(app, "tv_sessions")) == 1
    await tv_sessions.purge_tv_sign_in(env, clock.ms + 2 * 86400 * 1000)
    assert rows(app, "tv_sessions") == []


async def test_a_credential_never_renewed_is_revoked_a_week_after_its_first_session_ended_and_one_that_was_is_not(
    app, tv, phone, clock
):
    unused = await signed_in_tv(tv, phone, clock)
    kept = await signed_in_tv(tv, phone, clock)
    clock.advance(600)
    renewed = (await renew(tv, kept["refreshToken"])).json()
    env = Env(app.state.tv_db)

    await tv_sessions.purge_tv_sign_in(env, clock.ms + 2 * 86400 * 1000)
    await tv_sessions.purge_tv_sign_in(env, clock.ms + 7 * 86400 * 1000)
    assert len((await phone.get(DEVICES)).json()["devices"]) == 2
    clock.advance(8 * 86400)
    await tv_sessions.purge_tv_sign_in(env, clock.ms)

    by_hash = {row["refresh_hash"]: row for row in rows(app, "tv_sessions")}
    assert by_hash[hash_secret(renewed["refreshToken"])]["revoked_at"] is None
    assert [
        row["revoked_at"] is not None
        for row in rows(app, "tv_sessions")
        if row["renewed_at"] is None
    ] == [True]
    assert unused["refreshToken"]


async def test_a_tv_linked_on_saturday_and_opened_on_monday_is_still_signed_in(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    await tv_sessions.purge_tv_sign_in(
        Env(app.state.tv_db), clock.ms + 2 * 86400 * 1000
    )
    clock.advance(2 * 86400)

    assert (await renew(tv, answer["refreshToken"])).status_code == 200


async def test_every_answer_that_may_hold_a_secret_says_not_to_keep_it(
    tv, phone, clock
):
    request = await requested(tv)
    assert (await tv.post(START)).headers["cache-control"] == "no-store"
    await approved(phone, request)
    clock.advance(5)
    seen = [
        await tv.post(TOKEN, json={"deviceCode": request["deviceCode"]}),
        await tv.post(CONTINUE, json={"deviceCode": request["deviceCode"]}),
    ]
    renewal = await renew(tv, "r" * 43)
    answer = seen[1].json()
    seen.append(await renew(tv, answer["refreshToken"]))
    seen.append(await looked_up(phone, await requested(tv)))

    assert answer["token"]
    assert renewal.status_code == 401
    for response in seen:
        assert response.headers["cache-control"] == "no-store"


async def test_no_secret_reaches_the_logs(app, tv, phone, clock, caplog):
    caplog.set_level(logging.DEBUG)
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    await polled(tv, request)
    answer = await continued(tv, request)
    renewed = (await renew(tv, answer["refreshToken"])).json()

    logged = caplog.text
    for secret in (
        request["deviceCode"],
        request["userCode"],
        last_four(request),
        answer["refreshToken"],
        answer["token"],
        renewed["refreshToken"],
    ):
        assert secret not in logged


# Who approved, as the TV shows it


def test_a_short_address_is_never_shown_whole_in_its_first_part():
    assert masked_email("a@gmail.com") == "***@gmail.com"
    assert masked_email("ab@gmail.com") == "***@gmail.com"
    assert masked_email("abc@gmail.com") == "a***@gmail.com"


def test_an_address_is_masked_to_its_first_letter_and_its_domain():
    assert masked_email("tosin@gmail.com") == "t***@gmail.com"
    assert masked_email("tom@b.co") == "t***@b.co"
    assert masked_email("a@b@c.example") == "a***@c.example"
    for none in (None, "", "nobody", "@x.com", "x@"):
        assert masked_email(none) is None


@pytest.mark.parametrize(
    ("agent", "label"),
    [
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1", "iPhone"),
        ("Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1", "iPad"),
        ("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile", "Android phone"),
        ("Mozilla/5.0 (Linux; Android 9; AFTMM) Chrome/80", "Fire TV"),
        ("Mozilla/5.0 (Linux; Android 11; BRAVIA 4K) Chrome/90", "Sony TV"),
    ],
)
def test_a_phone_is_named_and_a_tv_that_runs_android_is_not_taken_for_one(agent, label):
    assert device_label(agent) == label


async def test_the_tv_is_told_who_approved_the_account_masked_and_the_phone_and_where(
    tv, phone, clock
):
    request = await requested(tv)
    await looked_up(phone, request)
    await phone.post(
        APPROVE,
        json={
            "userCode": request["userCode"],
            "learnerId": phone.learner,
            "confirm": last_four(request),
        },
        headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1",
            "CF-IPCountry": "ng",
        },
    )
    clock.advance(5)

    linking = await polled(tv, request)

    assert linking["approver"] == {
        "account": "t***@gmail.com",
        "label": "iPhone",
        "country": "NG",
    }
    assert "tosin" not in str(linking)


async def test_a_parent_session_carries_the_address_masked_and_never_whole(phone):
    from app.security.session import hint_of

    token = phone.headers["Authorization"].removeprefix("Bearer ")
    claims = verify(token, "s")

    assert hint_of(claims) == "t***@gmail.com"
    assert "tosin" not in token


async def test_an_approval_by_a_session_with_no_address_says_only_the_phone(
    app, tv, clock, monkeypatch
):
    async def no_address(id_token, api_key, **kwargs):
        from app.security import firebase

        return firebase.SignedIn(
            uid=UID,
            name="Ada",
            auth_time=int(time.time()),
            provider="google.com",
        )

    async with client(app) as bare:
        await signed_in(bare, firebaseIdToken="good")
        learner = await add_learner(bare, "Ada", "fresh")
        monkeypatch.setattr(routes_module, "verified", no_address)
        await as_parent(bare)
        request = await requested(tv)
        await looked_up(bare, request)
        await bare.post(
            APPROVE,
            json={
                "userCode": request["userCode"],
                "learnerId": learner,
                "confirm": last_four(request),
            },
        )
        clock.advance(5)

        linking = await polled(tv, request)

    assert linking["approver"].get("account") is None


# Open requests: the wider shares


async def test_a_network_holds_only_so_many_requests_open_whatever_its_addresses(
    tv, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_OPEN_PER_PREFIX", 3)
    for host in range(1, 4):
        await requested(tv, **{"CF-Connecting-IP": f"198.51.100.{host}"})

    refused = await tv.post(START, headers={"CF-Connecting-IP": "198.51.100.200"})
    elsewhere = await tv.post(START, headers={"CF-Connecting-IP": "198.51.101.1"})

    assert refused.status_code == 429
    assert elsewhere.status_code == 201


async def test_an_ipv6_48_is_one_network_for_the_open_requests(tv, monkeypatch):
    monkeypatch.setattr(tv_links, "MAX_OPEN_PER_PREFIX", 2)
    await requested(tv, **{"CF-Connecting-IP": "2001:db8:1:1::1"})
    await requested(tv, **{"CF-Connecting-IP": "2001:db8:1:2::1"})

    refused = await tv.post(START, headers={"CF-Connecting-IP": "2001:db8:1:ffff::1"})
    other = await tv.post(START, headers={"CF-Connecting-IP": "2001:db8:2::1"})

    assert refused.status_code == 429
    assert other.status_code == 201


async def test_one_country_holds_only_its_share_of_the_open_requests(tv, monkeypatch):
    monkeypatch.setattr(tv_links, "MAX_OPEN_PER_COUNTRY", 2)
    for network in (1, 2):
        await requested(
            tv, **{"CF-Connecting-IP": f"198.51.{network}.1", "CF-IPCountry": "NG"}
        )

    full = await tv.post(
        START, headers={"CF-Connecting-IP": "198.51.3.1", "CF-IPCountry": "NG"}
    )
    other = await tv.post(
        START, headers={"CF-Connecting-IP": "198.51.4.1", "CF-IPCountry": "GH"}
    )
    unknown = await tv.post(START, headers={"CF-Connecting-IP": "198.51.5.1"})

    assert full.status_code == 503
    assert (other.status_code, unknown.status_code) == (201, 201)


async def test_connections_with_no_country_share_one_smaller_bucket_and_cannot_dodge_the_cap(
    tv, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_OPEN_UNKNOWN_COUNTRY", 2)
    for network, header in ((1, {}), (2, {"CF-IPCountry": "T1"})):
        await requested(tv, **{"CF-Connecting-IP": f"198.51.{network}.1", **header})

    tor = await tv.post(
        START, headers={"CF-Connecting-IP": "198.51.3.1", "CF-IPCountry": "XX"}
    )
    named = await tv.post(
        START, headers={"CF-Connecting-IP": "198.51.4.1", "CF-IPCountry": "NG"}
    )

    assert tor.status_code == 503
    assert named.status_code == 201


async def test_the_phone_is_not_shown_a_country_for_an_unplaced_connection(tv, phone):
    request = await requested(tv, **{"CF-IPCountry": "T1"})

    seen = await looked_up(phone, request)

    assert seen.json()["country"] is None


async def test_starting_and_cancelling_in_a_loop_is_bounded_per_network_per_hour(
    tv, clock, monkeypatch
):
    monkeypatch.setattr(tv_links, "MAX_CREATED_PER_PREFIX_HOUR", 3)
    here = {"CF-Connecting-IP": "198.51.100.7"}
    for _ in range(3):
        request = await requested(tv, **here)
        await tv.post(CANCEL, json={"deviceCode": request["deviceCode"]})

    looping = await tv.post(START, headers={"CF-Connecting-IP": "198.51.100.9"})
    elsewhere = await tv.post(START, headers={"CF-Connecting-IP": "198.51.200.9"})
    clock.advance(61 * 60)
    later = await tv.post(START, headers=here)

    assert looping.status_code == 429
    assert elsewhere.status_code == 201
    assert later.status_code == 201


async def test_a_tv_behind_a_shared_address_can_hold_several_requests_open(tv):
    here = {"CF-Connecting-IP": "198.51.100.7"}

    for _ in range(6):
        assert (await tv.post(START, headers=here)).status_code == 201


# A holder's attempts, and nobody else's


async def test_another_accounts_lookups_neither_count_nor_use_the_request_up(
    app, tv, phone, other_phone
):
    request = await requested(tv)
    await looked_up(phone, request)

    for _ in range(tv_links.MAX_ATTEMPTS * 2):
        assert (await looked_up(other_phone, request)).status_code == 409

    assert rows(app, "tv_links")[0]["attempts"] == 1
    assert rows(app, "tv_links")[0]["status"] == "pending"
    assert (await approved(phone, request)).status_code == 204


# The cap of TVs, checked where the session is made


async def test_the_session_is_not_made_for_an_account_that_filled_its_tvs_since_the_approval(
    app, tv, phone, clock, monkeypatch
):
    first, second = await requested(tv), await requested(tv)
    assert (await approved(phone, first)).status_code == 204
    assert (await approved(phone, second)).status_code == 204
    clock.advance(5)
    monkeypatch.setattr(tv_sessions, "MAX_TVS_PER_ACCOUNT", 1)

    one = await continued(tv, first)
    two = await continued(tv, second)

    assert one["status"] == "approved"
    assert two == {"status": "full"}
    assert len(rows(app, "tv_sessions")) == 1
    assert [row["status"] for row in rows(app, "tv_links")] == ["consumed", "approved"]

    (listed,) = (await phone.get(DEVICES)).json()["devices"]
    await phone.delete(f"{DEVICES}/{listed['id']}")
    clock.advance(1)
    after = await continued(tv, second)

    assert after["status"] == "approved"
    assert rows(app, "tv_links")[1]["status"] == "consumed"


# Every router a TV session could reach


def test_every_route_of_the_app_is_classified_so_a_new_one_is_decided_on(app):
    """A TV's session is a learner's, so it reaches the learner's routes by design. Anything else
    must be named here, as refused (and walked above) or as open to a TV. A route added to the
    app falls in neither and fails this test, until someone says which it is. (The tutor chat
    over /a2a and the MCP views are not in the OpenAPI document; they sit behind the session
    guard and the learner's consent, as a learner's do.)"""
    refused = ("/api/account", "/api/tv-sign-in")
    tv_own = {
        f"{START}",
        TOKEN,
        CONTINUE,
        CANCEL,
        SESSION,
        SIGN_OUT,
    }
    learner_routes = (
        "/api/learner",
        "/api/chats",
        "/api/threads",
        "/api/curriculum",
        "/api/subjects",
        "/api/education",
        "/api/voice",
        "/api/health",
        "/api/session",
    )
    unclassified = [
        path
        for path in app.openapi()["paths"]
        if not path.startswith(refused) and not path.startswith(learner_routes)
    ]

    assert unclassified == []
    walked = {path for _, path in tv_forbidden_routes(app)}
    assert walked | tv_own | {"/api/account/learners"} >= {
        path for path in app.openapi()["paths"] if path.startswith(refused)
    }


# The schema, from the migration alone


def test_every_statement_the_code_runs_compiles_against_the_schema_of_0025_alone():
    """Built from 0025_tv_sign_in.sql and nothing else, so a column or an index the code needs
    and the migration lacks fails here, not in a deployed database. The statements are compiled
    (EXPLAIN), not run."""
    import sqlite3
    from pathlib import Path

    migration = (
        Path(tv_links.__file__).parents[3] / "migrations" / "0025_tv_sign_in.sql"
    )
    database = sqlite3.connect(":memory:")
    database.executescript(migration.read_text())
    statements = {
        f"{module.__name__}.{name}": value
        for module in (tv_links, tv_sessions)
        for name, value in vars(module).items()
        if name.endswith("_SQL") and isinstance(value, str)
    }
    assert len(statements) >= 20

    for name, sql in statements.items():
        slots = max((int(n) for n in re.findall(r"\?(\d+)", sql)), default=0)
        try:
            database.execute("EXPLAIN " + sql, (None,) * slots)
        except sqlite3.Error as error:
            raise AssertionError(f"{name}: {error}") from error
