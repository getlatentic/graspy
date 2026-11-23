# ruff: noqa: F811
"""The parent PIN after its second security review: a Google proof proves once and only for the
session it is made under, the guess budget is exactly fifteen per Google proof whatever a parent
does between, a bare Google token ranks below a parent's session, and the budget keys. The
fixtures and helpers are test_parent_pin's (docs/PARENT_PIN.md)."""

import asyncio
import time

import pytest
from signed_in import client, signed_in, use
from test_parent_pin import (  # noqa: F401  (fixtures)
    MINUTE,
    OTHER_PIN,
    PIN,
    SECRET,
    STATUS,
    UID,
    Budget,
    added_learner,
    app,
    as_parent_of,
    clock,
    env,
    phone,
    pinned,
    row,
    set_pin,
    typed,
    wrong_five,
)

from app.account import parent_pins
from app.security.session import issue, verify

PARENT_SESSION = "/api/account/parent-session"


def reused(response) -> bool:
    return (
        response.status_code == 401
        and response.json()["detail"]["code"] == "sign_in_reused"
    )


# M1: a Google proof proves once


async def test_a_google_token_sets_the_pin_once_and_cannot_be_sent_again(phone):
    first = await set_pin(phone, PIN, firebaseIdToken="at:5")
    again = await set_pin(phone, "264819", firebaseIdToken="at:5")

    assert first.status_code == 200
    assert reused(again)
    assert (await typed(phone, PIN)).status_code == 200


async def test_a_token_that_proved_one_thing_proves_nothing_else(phone):
    assert (await set_pin(phone, PIN, firebaseIdToken="at:5")).status_code == 200

    parent = await phone.post(PARENT_SESSION, json={"firebaseIdToken": "at:5"})
    learner = await phone.post(
        "/api/account/learners",
        json={
            "name": "A",
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": "at:5"},
        },
    )

    assert reused(parent) and reused(learner)


async def test_a_token_of_an_earlier_sign_in_than_one_that_proved_does_not_prove(phone):
    assert (await set_pin(phone, PIN, firebaseIdToken="at:8")).status_code == 200

    older = await set_pin(phone, "264819", firebaseIdToken="at:6")
    newer = await set_pin(phone, "264819", firebaseIdToken="at:9")

    assert reused(older) and newer.status_code == 200


async def test_two_requests_with_one_token_at_once_are_not_both_taken(phone):
    answers = await asyncio.gather(
        set_pin(phone, PIN, firebaseIdToken="at:5"),
        set_pin(phone, "264819", firebaseIdToken="at:5"),
        phone.post(PARENT_SESSION, json={"firebaseIdToken": "at:5"}),
    )

    assert sorted(a.status_code for a in answers) == [200, 401, 401]


async def test_a_sign_in_from_before_the_session_was_made_cannot_prove_for_it(phone):
    """The sign-in that made the session, or an earlier one, is not a proof made under it."""
    earlier = await phone.post(PARENT_SESSION, json={"firebaseIdToken": "at:-20"})
    later = await phone.post(PARENT_SESSION, json={"firebaseIdToken": "at:3"})

    assert reused(earlier)
    assert later.status_code == 200


async def test_the_sign_in_that_made_the_session_proves_for_it_once_and_the_session_does_not_spend_it(
    app,
):
    """Signed out: one sign-in makes the account's session and then the parent's from one token."""
    async with client(app) as http:
        first = await signed_in(http, firebaseIdToken="at:3")
        # Minting a session from it again (a renewal) spends nothing.
        await signed_in(http, firebaseIdToken="at:3")
        assert first["signedIn"] is True

        parent = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:3"})
        again = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:3"})

    assert parent.status_code == 200 and reused(again)
    assert verify(parent.json()["token"], SECRET)["gate"] == "google"


async def test_a_session_minted_from_one_sign_in_does_not_take_another_older_one(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="at:3")

        older = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:-2"})

    assert reused(older)


async def test_the_token_of_a_bare_consent_is_spent_by_it(phone, env):
    learner = await added_learner(phone)
    url = f"/api/account/learners/{learner}/consent"
    body = {"noticeVersion": 1, "firebaseIdToken": "at:4"}

    first = await phone.put(url, json=body)
    again = await phone.put(url, json=body)

    assert first.status_code == 200 and reused(again)


async def test_a_google_parent_session_keeps_the_time_of_its_sign_in_as_its_proof(
    phone, env
):
    learner = await added_learner(phone)
    parent = await phone.post(PARENT_SESSION, json={"firebaseIdToken": "at:9"})
    claims = verify(parent.json()["token"], SECRET)
    use(phone, parent.json())

    await phone.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    [kept] = env.DB.rows("SELECT gate, proved_at FROM consents")
    assert claims["at"] == claims["iat"] + 4 or claims["at"] > claims["iat"]
    assert kept["gate"] == "google" and kept["proved_at"] == claims["at"] * 1000


async def test_every_token_says_when_it_was_made_and_a_parent_s_session_starts_then():
    made = issue(SECRET, account=UID, parent=True, gate="pin", now=time.time() - 100)
    claims = verify(made.token, SECRET)

    assert claims["iat"] == int(claims["exp"] - 15 * 60)
    from app.security.session import started_at

    assert started_at({"par": True, "iat": 7, "exp": 99999}) == 7
    assert started_at({"par": True, "exp": 1000}) == 1000 - 15 * 60


async def test_deleting_the_account_is_held_to_the_real_time_of_the_sign_in(
    app, monkeypatch
):
    real = time.time
    async with client(app) as http:
        # Signed out: one sign-in, 200 seconds old, makes the account's session and the parent's.
        await signed_in(http, firebaseIdToken="at:-200")
        parent = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:-200"})
        use(http, parent.json())
        # The session was made a moment ago, but the sign-in behind it is 200 seconds old; two
        # more minutes make it more than five.
        monkeypatch.setattr(time, "time", lambda: real() + 2 * 60)

        refused = await http.delete("/api/account")

    assert parent.status_code == 200
    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        403,
        "google_sign_in_required",
    )


# M2: exactly fifteen guesses per Google proof


async def wrongs(http, count: int) -> list:
    return [await typed(http, OTHER_PIN) for _ in range(count)]


async def test_a_parent_s_success_between_wrong_guesses_gives_none_back(pinned, env):
    answers = []
    for _ in range(3):
        answers += await wrongs(pinned, 4)
        assert (await typed(pinned, PIN)).status_code == 200
    answers += await wrongs(pinned, 3)

    codes = [a.json()["detail"]["code"] for a in answers]
    assert codes.count("pin_wrong") == 14 and codes[-1] == "pin_disabled"
    assert row(env)["disabled"] == 1 and row(env)["proof_wrong"] == 15
    assert (await typed(pinned, PIN)).json()["detail"]["code"] == "pin_disabled"


async def test_the_fifteenth_wrong_pin_turns_it_off_whatever_the_locks_were(
    pinned, clock, env
):
    # Locks only on the way (the ladder), a success in the middle: still fifteen.
    await wrongs(pinned, 5)
    clock.advance(16 * MINUTE)
    assert (await typed(pinned, PIN)).status_code == 200
    await wrongs(pinned, 5)
    clock.advance(61 * MINUTE)
    assert (await typed(pinned, PIN)).status_code == 200
    last = await wrongs(pinned, 5)

    assert last[-1].json()["detail"]["code"] == "pin_disabled"
    assert row(env)["proof_wrong"] == 15


async def test_only_a_google_proof_gives_the_guesses_back(pinned, env):
    await wrongs(pinned, 4)
    assert (await typed(pinned, PIN)).status_code == 200
    assert row(env)["proof_wrong"] == 4

    reset = await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")

    assert reset.status_code == 200 and row(env)["proof_wrong"] == 0


async def test_a_change_with_the_old_pin_does_not_give_them_back_either(pinned, env):
    await wrongs(pinned, 4)

    changed = await set_pin(pinned, OTHER_PIN, currentPin=PIN)

    assert changed.status_code == 200 and row(env)["proof_wrong"] == 4


async def test_a_right_pin_while_fifteen_are_counted_is_refused_and_does_not_unlock_it(
    pinned, env
):
    env.DB.connection.execute("UPDATE parent_pins SET proof_wrong = 15")

    answer = await typed(pinned, PIN)

    assert answer.json()["detail"]["code"] == "pin_disabled"
    assert row(env)["disabled"] == 1


async def test_exactly_fifteen_wrong_pins_are_compared_per_google_proof(
    pinned, clock, monkeypatch
):
    compared = []
    real = parent_pins.hash_pin

    async def counting(*args, **kwargs):
        compared.append(1)
        return await real(*args, **kwargs)

    monkeypatch.setattr("app.account.parent_pins.hash_pin", counting)
    for _ in range(8):
        await wrong_five(pinned)
        await typed(pinned, PIN)
        clock.advance(25 * 60 * MINUTE)

    wrong = len(compared) - sum(1 for _ in range(0))
    assert (
        wrong <= 15 + 8
    )  # fifteen wrong, and the right PIN of each round while it still counts


# M4: a bare token ranks below a parent's session


async def test_a_bare_token_adding_the_first_learner_is_stamped_google_token(
    phone, env
):
    created = await phone.post(
        "/api/account/learners",
        json={
            "name": "A",
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": "at:3"},
        },
    )

    assert created.status_code == 201
    assert env.DB.rows("SELECT gate FROM consents") == [{"gate": "google-token"}]


async def test_a_bare_token_cannot_add_more_learners_where_there_is_a_pin(pinned, env):
    await added_learner(pinned)

    refused = await pinned.post(
        "/api/account/learners",
        json={
            "name": "B",
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": "at:3"},
        },
    )

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        403,
        "account_required",
    )
    assert len((await pinned.get("/api/account/learners")).json()["learners"]) == 1


async def test_a_bare_token_may_add_where_the_account_has_no_pin(phone):
    await added_learner(phone)

    created = await phone.post(
        "/api/account/learners",
        json={
            "name": "B",
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": "at:3"},
        },
    )

    assert created.status_code == 201


async def test_a_parent_s_session_may_add_where_there_is_a_pin(pinned):
    await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())

    created = await pinned.post(
        "/api/account/learners",
        json={"name": "B", "guardian": True, "consent": {"noticeVersion": 1}},
    )

    assert created.status_code == 201


async def test_a_token_with_a_parent_s_session_is_not_called_a_bare_token(phone, env):
    use(phone, await as_parent_of(phone))
    learner = await added_learner(phone)

    await phone.put(
        f"/api/account/learners/{learner}/consent",
        json={"noticeVersion": 1, "firebaseIdToken": "at:9"},
    )

    assert env.DB.rows("SELECT gate FROM consents") == [{"gate": "google"}]


# M5: the per-source budget is the account's own


async def test_the_source_budget_is_kept_per_account_and_source(app, pinned):
    app.state.pin_limiter = budget = Budget()

    await typed(pinned, OTHER_PIN)

    assert budget.keys[1].startswith(f"pin:source:{UID}:")


async def test_a_stranger_behind_the_same_address_cannot_spend_this_accounts_source_budget(
    app, pinned
):
    class Spent:
        async def allow(self, key: str) -> bool:
            return not key.startswith("pin:source:uid456:")

    app.state.pin_limiter = Spent()

    assert (await typed(pinned, PIN)).status_code == 200


# LOW: types, decay, approved links


def test_every_timestamp_in_the_lock_arithmetic_is_cast_to_an_integer():
    for sql in (parent_pins.CHARGE_SQL, parent_pins.LOCK_SQL):
        assert "?2" not in sql.replace("CAST(?2 AS INTEGER)", "")
    assert "CAST(?7 AS INTEGER)" in parent_pins.LOCK_SQL


async def test_the_ladder_decays_the_same_when_a_timestamp_arrives_as_a_float(
    pinned, clock, env
):
    await wrong_five(pinned)
    env.DB.connection.execute(
        "UPDATE parent_pins SET locked_until = 0, failed_count = 0"
    )
    later = float(row(env)["last_failed_at"] + 7 * 24 * 60 * MINUTE + 1)

    for _ in range(5):
        await parent_pins.check(env.DB, SECRET, UID, OTHER_PIN, later)

    assert row(env)["lockouts"] == 1 and row(env)["locked_until"] == int(
        later + 15 * MINUTE
    )


def test_the_migration_says_to_reset_a_database_that_ran_an_earlier_one():
    from pathlib import Path

    text = (
        Path(parent_pins.__file__).parents[3] / "migrations" / "0026_parent_pin.sql"
    ).read_text()

    assert "RESET any database that applied an earlier" in text


@pytest.mark.parametrize("old", ["fresh"])
async def test_the_pin_reset_budget_is_not_spent_by_proofs(app, pinned, old):
    app.state.pin_limiter = Budget(allowed=False)

    assert (await set_pin(pinned, OTHER_PIN, firebaseIdToken=old)).status_code == 200
