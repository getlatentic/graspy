"""Signing a TV in from a phone: every state of a request, expiry, the limits, and what an account
that is not the approver, or a replay, can do. docs/TV_SIGN_IN.md has the design."""

import logging

import pytest
from consent_sign_ins import OTHER_UID, consent_app
from signed_in import UID, as_learner, client, signed_in, signed_in_app, use
from voice_worker import worker_env

from app.account import tv_links, tv_sessions
from app.account.directory import learner_key
from app.account.tv_codes import (
    USER_CODE_ALPHABET,
    device_label,
    new_user_code,
    normalised_user_code,
)
from app.security.session import TV_TOKEN_TTL_SECONDS, tv_of, verify

BASE = 1_800_000_000_000
START = "/api/tv-sign-in"
TOKEN = f"{START}/token"
SESSION = f"{START}/session"
LOOKUP = f"{START}/lookup"
APPROVE = f"{START}/approve"
DENY = f"{START}/deny"
DEVICES = f"{START}/devices"
SAMSUNG = "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 Chrome/94 TV Safari/537.36"


class Clock:
    def __init__(self) -> None:
        self.ms = BASE

    def advance(self, seconds: float) -> None:
        self.ms += int(seconds * 1000)


@pytest.fixture
def clock(monkeypatch):
    ticking = Clock()
    for module in ("app.api.tv_sign_in_routes",):
        monkeypatch.setattr(f"{module}.now_ms", lambda: ticking.ms)
    return ticking


@pytest.fixture
def app(monkeypatch, clock):
    return signed_in_app(monkeypatch)


@pytest.fixture
async def phone(app):
    """A phone signed in as one account with one learner."""
    async with client(app) as http:
        http.learner = await as_learner(http)
        yield http


@pytest.fixture
async def tv(app):
    async with client(app) as http:
        yield http


async def requested(tv, **headers) -> dict:
    response = await tv.post(START, headers={"User-Agent": SAMSUNG, **headers})
    assert response.status_code == 201
    return response.json()


async def polled(tv, request: dict) -> dict:
    response = await tv.post(TOKEN, json={"deviceCode": request["deviceCode"]})
    assert response.status_code == 200
    return response.json()


async def approved(phone, request: dict, learner: str | None = None):
    return await phone.post(
        APPROVE,
        json={"userCode": request["userCode"], "learnerId": learner or phone.learner},
    )


async def signed_in_tv(tv, phone, clock) -> dict:
    """The whole flow, and the TV's answer."""
    request = await requested(tv)
    assert (await approved(phone, request)).status_code == 204
    clock.advance(request["interval"])
    return await polled(tv, request)


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
    request = await requested(tv, Origin="https://evil.example")

    assert request["verificationUri"] == "http://localhost:5173/link"


async def test_neither_code_is_kept_in_the_clear(app, tv):
    request = await requested(tv)

    (row,) = rows(app, "tv_links")
    stored = " ".join(str(value) for value in row.values())
    assert request["deviceCode"] not in stored
    assert request["userCode"] not in stored
    assert row["label"] == "Samsung TV"
    assert row["status"] == "pending"


async def test_a_request_is_labelled_with_the_country_cloudflare_names(app, tv):
    await requested(tv, **{"CF-IPCountry": "ng"})
    await requested(tv, **{"CF-IPCountry": "XX"})

    assert [row["country"] for row in rows(app, "tv_links")] == ["NG", None]


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
    seen = await phone.post(LOOKUP, json={"userCode": request["userCode"]})
    assert seen.status_code == 404
    assert (await approved(phone, request)).status_code == 404


async def test_an_approval_that_the_tv_was_too_late_to_take_has_expired_too(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)

    clock.advance(11 * 60)

    assert (await polled(tv, request))["status"] == "expired"
    assert rows(app, "tv_sessions") == []


# The phone looks, approves or denies


async def test_the_phone_sees_what_it_is_asked_to_approve(tv, phone, clock):
    request = await requested(tv, **{"CF-IPCountry": "NG"})
    clock.advance(30)

    seen = await phone.post(LOOKUP, json={"userCode": request["userCode"]})

    assert seen.status_code == 200
    assert seen.json() == {
        "label": "Samsung TV",
        "country": "NG",
        "createdAt": BASE,
        "expiresAt": BASE + 600_000,
    }
    assert request["deviceCode"] not in seen.text


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


async def test_approving_gives_the_tv_a_session_for_that_learner_once(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    assert answer["status"] == "approved"
    claims = verify(answer["token"], "s")
    assert claims["acct"] == UID
    assert claims["sub"] == learner_key(UID, phone.learner)
    assert tv_of(claims)
    assert answer["learner"]["id"] == phone.learner
    assert answer["account"] == UID
    assert answer["refreshToken"]
    assert answer["expiresIn"] == TV_TOKEN_TTL_SECONDS == 3600


async def test_the_session_the_tv_takes_is_the_learners_and_works_as_theirs(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    use(tv, answer)

    assert (
        await tv.post("/api/account/learners/x/session", json={})
    ).status_code == 403


async def test_a_tv_can_read_who_it_learns_as_and_nobody_else_of_the_account(
    tv, phone, clock
):
    other = await phone.post(
        "/api/account/learners", json={"name": "Ben", "guardian": True}
    )
    assert other.status_code == 201
    use(tv, await signed_in_tv(tv, phone, clock))

    listed = (await tv.get("/api/account/learners")).json()["learners"]

    assert [one["id"] for one in listed] == [phone.learner]


async def test_a_second_poll_of_an_approved_request_finds_nothing_to_take(
    app, tv, phone, clock
):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    first = await polled(tv, request)
    clock.advance(5)
    again = await polled(tv, request)

    assert first["status"] == "approved"
    assert again == {"status": "expired"}
    assert len(rows(app, "tv_sessions")) == 1


async def test_a_replayed_device_code_gets_no_session(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    await polled(tv, request)

    async with client(app) as thief:
        clock.advance(5)
        stolen = (
            await thief.post(TOKEN, json={"deviceCode": request["deviceCode"]})
        ).json()

    assert stolen == {"status": "expired"}


async def test_two_polls_at_once_make_one_session(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)
    now = clock.ms

    first = await tv_sessions.take(app.state.tv_db, request["deviceCode"], now)
    second = await tv_sessions.take(app.state.tv_db, request["deviceCode"], now)

    assert first is not None
    assert second is None
    assert len(rows(app, "tv_sessions")) == 1


async def test_denying_tells_the_tv_and_nothing_can_approve_it_after(tv, phone, clock):
    request = await requested(tv)

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


async def test_two_approvals_racing_for_one_request_have_one_winner(app, tv, phone):
    request = await requested(tv)
    link = await tv_links.touch(app.state.tv_db, "s", request["userCode"], BASE)

    won = await tv_links.approve(app.state.tv_db, link["id"], UID, "a", BASE)
    lost = await tv_links.approve(app.state.tv_db, link["id"], OTHER_UID, "b", BASE)

    assert (won, lost) == (True, False)
    (row,) = rows(app, "tv_links")
    assert row["account_uid"] == UID


async def test_a_denial_after_an_approval_changes_nothing(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)

    assert (
        await phone.post(DENY, json={"userCode": request["userCode"]})
    ).status_code == 404
    clock.advance(5)
    assert (await polled(tv, request))["status"] == "approved"


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
        (APPROVE, {**body, "learnerId": "x"}),
        (DENY, body),
    ):
        assert (await tv.post(path, json=sent)).status_code == 401
    assert (await tv.get(DEVICES)).status_code == 401


async def test_a_device_with_no_account_cannot_approve(app, tv):
    request = await requested(tv)
    async with client(app) as anonymous:
        await signed_in(anonymous)
        refused = await anonymous.post(LOOKUP, json={"userCode": request["userCode"]})

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
        assert refused.json()["detail"]["code"] == "tv_session"
    assert (await tv.get(DEVICES)).status_code == 403
    assert (await tv.delete("/api/account")).status_code == 403
    assert (
        await tv.patch(f"/api/account/learners/{phone.learner}", json={"name": "Eve"})
    ).status_code == 403
    assert (
        await tv.post("/api/account/parent-session", json={"firebaseIdToken": "good"})
    ).status_code == 403


async def test_the_tenth_attempt_on_a_code_ends_the_request(tv, phone, clock):
    request = await requested(tv)
    body = {"userCode": request["userCode"]}

    for _ in range(tv_links.MAX_ATTEMPTS - 1):
        assert (await phone.post(LOOKUP, json=body)).status_code == 200
    ended = await phone.post(LOOKUP, json=body)
    clock.advance(5)

    assert ended.status_code == 404
    assert (await phone.post(LOOKUP, json=body)).status_code == 404
    assert (await approved(phone, request)).status_code == 404
    assert (await polled(tv, request))["status"] == "denied"


# Another account


@pytest.fixture
def two_accounts(monkeypatch, clock):
    env = worker_env()
    return consent_app(monkeypatch, env), env


async def sign_in_with_learner(http, token: str) -> str:
    await signed_in(http, firebaseIdToken=token)
    created = await http.post(
        "/api/account/learners",
        json={
            "name": "Ada",
            "guardian": True,
            "consent": {
                "noticeVersion": 1,
                "firebaseIdToken": "fresh" if token == "good" else "other",
            },
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def test_the_session_a_tv_takes_belongs_to_the_account_that_approved_it(
    two_accounts, clock
):
    app, _ = two_accounts
    async with client(app) as tv, client(app) as mine, client(app) as theirs:
        mine.learner = await sign_in_with_learner(mine, "good")
        theirs.learner = await sign_in_with_learner(theirs, "good2")
        request = await requested(tv)

        approving = await theirs.post(
            APPROVE,
            json={"userCode": request["userCode"], "learnerId": theirs.learner},
        )
        clock.advance(5)
        answer = await polled(tv, request)

    assert approving.status_code == 204
    assert verify(answer["token"], "s")["acct"] == OTHER_UID
    assert answer["account"] == OTHER_UID


async def test_an_account_cannot_approve_for_a_learner_of_another_account(
    two_accounts,
):
    app, _ = two_accounts
    async with client(app) as tv, client(app) as mine, client(app) as theirs:
        mine.learner = await sign_in_with_learner(mine, "good")
        await sign_in_with_learner(theirs, "good2")
        request = await requested(tv)

        refused = await theirs.post(
            APPROVE,
            json={"userCode": request["userCode"], "learnerId": mine.learner},
        )

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"


async def test_an_account_cannot_list_or_remove_another_accounts_tvs(
    two_accounts, clock
):
    app, _ = two_accounts
    async with client(app) as tv, client(app) as mine, client(app) as theirs:
        mine.learner = await sign_in_with_learner(mine, "good")
        await sign_in_with_learner(theirs, "good2")
        request = await requested(tv)
        await mine.post(
            APPROVE,
            json={"userCode": request["userCode"], "learnerId": mine.learner},
        )
        clock.advance(5)
        await polled(tv, request)
        (listed,) = (await mine.get(DEVICES)).json()["devices"]

        others = (await theirs.get(DEVICES)).json()
        removed = await theirs.delete(f"{DEVICES}/{listed['id']}")
        still = (await mine.get(DEVICES)).json()["devices"]

    assert others == {"devices": []}
    assert removed.status_code == 404
    assert still == [listed]


async def test_a_learner_without_a_parents_agreement_cannot_be_signed_in_on_a_tv(
    two_accounts,
):
    app, _ = two_accounts
    async with client(app) as tv, client(app) as mine:
        await signed_in(mine, firebaseIdToken="good")
        bare = (
            await mine.post(
                "/api/account/learners", json={"name": "Ada", "guardian": True}
            )
        ).json()["id"]
        request = await requested(tv)

        refused = await mine.post(
            APPROVE, json={"userCode": request["userCode"], "learnerId": bare}
        )

    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "consent_required"


# Renewing, listing and revoking


async def test_the_tv_renews_its_session_from_its_credential(app, tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)
    clock.advance(3000)

    renewed = await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})

    assert renewed.status_code == 200
    body = renewed.json()
    assert body["signedIn"] is True
    assert body["learner"]["id"] == phone.learner
    assert body["expiresIn"] == TV_TOKEN_TTL_SECONDS
    assert tv_of(verify(body["token"], "s")) == tv_of(verify(answer["token"], "s"))


async def test_a_credential_is_kept_only_as_a_hash(app, tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    (row,) = rows(app, "tv_sessions")
    assert answer["refreshToken"] not in " ".join(str(v) for v in row.values())


async def test_a_credential_nobody_issued_is_refused(tv):
    refused = await tv.post(SESSION, json={"refreshToken": "r" * 43})

    assert refused.status_code == 401
    assert refused.json()["detail"]["code"] == "tv_revoked"


async def test_the_account_lists_its_tvs_and_revokes_one(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    (listed,) = (await phone.get(DEVICES)).json()["devices"]
    assert listed["label"] == "Samsung TV"
    assert listed["learner"]["id"] == phone.learner
    assert set(listed) == {"id", "label", "learner", "createdAt", "lastUsedAt"}
    removed = await phone.delete(f"{DEVICES}/{listed['id']}")

    assert removed.status_code == 204
    assert (await phone.get(DEVICES)).json() == {"devices": []}
    refused = await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    assert refused.status_code == 401
    assert (await phone.delete(f"{DEVICES}/{listed['id']}")).status_code == 404


async def test_a_credential_ends_after_thirty_days_unused(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    clock.advance(30 * 86400 - 60)
    assert (
        await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    ).status_code == 200
    clock.advance(30 * 86400 + 60)
    assert (
        await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    ).status_code == 401


async def test_a_credential_in_daily_use_still_ends_after_ninety_days(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)
    for _ in range(89):
        clock.advance(86400)
        assert (
            await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
        ).status_code == 200

    clock.advance(2 * 86400)

    assert (
        await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    ).status_code == 401


async def test_the_tv_signing_out_revokes_its_credential(tv, phone, clock):
    answer = await signed_in_tv(tv, phone, clock)

    out = await tv.post(
        f"{START}/sign-out", json={"refreshToken": answer["refreshToken"]}
    )

    assert out.status_code == 204
    assert (await phone.get(DEVICES)).json() == {"devices": []}
    assert (
        await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    ).status_code == 401
    assert (
        await tv.post(f"{START}/sign-out", json={"refreshToken": "z" * 43})
    ).status_code == 204


async def test_a_tv_whose_learner_was_removed_is_revoked_when_it_renews(
    app, tv, phone, clock
):
    answer = await signed_in_tv(tv, phone, clock)
    await phone.delete(f"/api/account/learners/{phone.learner}")

    refused = await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})

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
    assert (
        await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})
    ).status_code == 401


# Limits and clean-up


class Budget:
    def __init__(self, allowed: bool = True) -> None:
        self.allowed, self.keys = allowed, []

    async def allow(self, key: str) -> bool:
        self.keys.append(key)
        return self.allowed


async def test_asking_for_a_code_spends_the_pairing_budget_of_the_address(app, tv):
    app.state.pairing_limiter = budget = Budget()

    await requested(tv, **{"CF-Connecting-IP": "198.51.100.7"})

    assert budget.keys == ["tv-start:198.51.100.7"]


async def test_a_spent_budget_refuses_a_request_with_a_retry_after(app, tv):
    app.state.pairing_limiter = Budget(allowed=False)

    refused = await tv.post(START)

    assert refused.status_code == 429
    assert refused.headers["retry-after"] == "60"
    assert refused.json()["detail"]["code"] == "rate_limited"
    assert rows(app, "tv_links") == []


async def test_looking_a_code_up_spends_the_budget_of_the_account_and_the_address(
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


async def test_requests_stop_at_the_cap_of_open_requests(app, tv, monkeypatch):
    monkeypatch.setattr(tv_links, "MAX_OPEN_LINKS", 2)
    await requested(tv)
    await requested(tv)

    refused = await tv.post(START)

    assert refused.status_code == 503
    assert refused.json()["detail"]["code"] == "tv_sign_in_busy"


async def test_expired_requests_and_ended_credentials_are_purged(app, tv, phone, clock):
    request = await requested(tv)
    await approved(phone, request)
    clock.advance(5)
    await polled(tv, request)
    (listed,) = (await phone.get(DEVICES)).json()["devices"]
    await phone.delete(f"{DEVICES}/{listed['id']}")

    class Env:
        DB = app.state.tv_db

    clock.advance(2 * 3600)
    current = await requested(tv)
    await tv_sessions.purge_tv_sign_in(Env, clock.ms)

    assert [row["status"] for row in rows(app, "tv_links")] == ["pending"]
    assert current["userCode"]
    assert len(rows(app, "tv_sessions")) == 1
    await tv_sessions.purge_tv_sign_in(Env, clock.ms + 2 * 86400 * 1000)
    assert rows(app, "tv_sessions") == []


async def test_no_secret_reaches_the_logs(app, tv, phone, clock, caplog):
    caplog.set_level(logging.DEBUG)
    request = await requested(tv)
    await phone.post(LOOKUP, json={"userCode": request["userCode"]})
    await approved(phone, request)
    clock.advance(5)
    answer = await polled(tv, request)
    await tv.post(SESSION, json={"refreshToken": answer["refreshToken"]})

    logged = caplog.text
    for secret in (
        request["deviceCode"],
        request["userCode"],
        answer["refreshToken"],
        answer["token"],
    ):
        assert secret not in logged
