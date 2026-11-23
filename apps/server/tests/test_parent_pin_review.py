# ruff: noqa: F811
"""The parent PIN after its security review: the guess budget, what a child's session may not do to
the account's learners, how fresh a parent's session must be to agree, what a stored row must be,
and what the parent is told (docs/PARENT_PIN.md). The fixtures and helpers are test_parent_pin's."""

import asyncio
import json
import sqlite3
import time
from pathlib import Path

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
    one_clock,
    phone,
    pinned,
    row,
    set_pin,
    typed,
    wrong_five,
)

from app.account import parent_pin_kdf, parent_pins, pin_events
from app.security.session import verify

WEAK = json.loads(
    (Path(__file__).parents[3] / "tests" / "fixtures" / "weak-pins.json").read_text()
)


# The guess budget: what is refused as a PIN (the app's own test reads the same file)


@pytest.mark.parametrize("weak", WEAK["weak"])
def test_the_pins_a_person_tries_first_are_refused(weak):
    assert parent_pin_kdf.too_easy(weak)


@pytest.mark.parametrize("fine", WEAK["fine"])
def test_a_pin_that_is_not_a_pattern_is_accepted(fine):
    assert not parent_pin_kdf.too_easy(fine)


def test_a_pin_is_at_least_six_digits():
    assert parent_pin_kdf.MIN_LENGTH == 6


async def test_a_four_digit_pin_is_refused_whatever_it_is(phone):
    refused = await set_pin(phone, "4829", firebaseIdToken="fresh")

    assert refused.status_code == 422


def test_the_table_will_not_hold_a_pin_of_fewer_than_six(env):
    with pytest.raises(sqlite3.IntegrityError):
        env.DB.connection.execute(
            "INSERT INTO parent_pins (account_uid, salt, hash, kdf, iterations, pepper_id, "
            "pin_length, set_at) VALUES ('u', 's', 'h', 'pbkdf2-sha256', 100000, 'p', 4, 1)"
        )


# H2: a child's session does not change who the account's learners are


@pytest.fixture
async def child(app):
    """A learner's own session: the account's, no parent."""
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        yield http


async def test_a_childs_session_cannot_rename_remove_or_add_a_learner(phone, child):
    learner = await added_learner(phone)

    renamed = await child.patch(f"/api/account/learners/{learner}", json={"name": "X"})
    removed = await child.delete(f"/api/account/learners/{learner}")
    added = await child.post(
        "/api/account/learners", json={"name": "Z", "guardian": True}
    )

    assert [r.status_code for r in (renamed, removed, added)] == [403, 403, 403]
    assert {r.json()["detail"]["code"] for r in (renamed, removed, added)} == {
        "account_required"
    }
    listed = (await child.get("/api/account/learners")).json()["learners"]
    assert [one["name"] for one in listed] == ["Ada"]


async def test_the_parent_by_pin_may_rename_remove_and_add(pinned):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())

    renamed = await pinned.patch(
        f"/api/account/learners/{learner}", json={"name": "Bo"}
    )
    added = await pinned.post(
        "/api/account/learners", json={"name": "Cy", "guardian": True}
    )
    removed = await pinned.delete(f"/api/account/learners/{learner}")

    assert (renamed.status_code, added.status_code, removed.status_code) == (
        200,
        201,
        200,
    )


async def test_the_places_of_an_account_cannot_be_filled_by_a_child(child):
    for _ in range(9):
        await child.post("/api/account/learners", json={"name": "A", "guardian": True})

    assert (await child.get("/api/account/learners")).json()["learners"] == []


# M1: an agreement needs a parent's session that is fresh


@pytest.fixture
def later(monkeypatch):
    """Moves the time sessions are judged by forward."""
    real = time.time
    offset = [0.0]
    monkeypatch.setattr(time, "time", lambda: real() + offset[0])

    def move(seconds: float) -> None:
        offset[0] += seconds

    return move


async def test_a_parent_session_older_than_two_minutes_cannot_agree(pinned, later, env):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())
    later(3 * 60)

    refused = await pinned.put(
        f"/api/account/learners/{learner}/voice/consent",
        json={"noticeVersion": 1, "retentionDays": 30},
    )
    still = await pinned.get(f"/api/account/learners/{learner}/voice")

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        403,
        "parent_fresh_required",
    )
    assert still.status_code == 200
    assert env.DB.rows("SELECT * FROM consents") == []


async def test_a_service_consent_needs_the_fresh_session_too(pinned, later):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())
    later(3 * 60)

    refused = await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )
    use(pinned, (await typed(pinned, PIN)).json())
    agreed = await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    assert refused.json()["detail"]["code"] == "parent_fresh_required"
    assert agreed.status_code == 200


async def test_the_consent_records_when_the_parent_proved_themselves(pinned, env):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())
    before = int(time.time()) * 1000 - 1000

    await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    [kept] = env.DB.rows("SELECT gate, proved_at FROM consents")
    assert kept["gate"] == "pin" and before <= kept["proved_at"] <= before + 5000


# M5: deleting the account needs a Google proof of the last five minutes


async def test_a_google_session_older_than_five_minutes_cannot_delete_the_account(
    pinned, later, env
):
    use(pinned, await as_parent_of(pinned))
    later(6 * 60)

    refused = await pinned.delete("/api/account")

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        403,
        "google_sign_in_required",
    )
    assert env.DB.rows("SELECT * FROM parent_pins") != []


async def test_a_google_session_of_the_last_five_minutes_deletes_it(pinned, later):
    use(pinned, await as_parent_of(pinned))
    later(4 * 60)

    assert (await pinned.delete("/api/account")).status_code == 204


# L1, L2, L4: what a stored row must be


async def test_a_change_is_written_only_against_the_pin_that_was_typed(pinned, env):
    before = row(env)["hash"]

    wrote = await parent_pins.change(
        env.DB, SECRET, UID, "264819", "not-the-hash", int(time.time() * 1000)
    )

    assert wrote is False and row(env)["hash"] == before


async def test_two_changes_with_the_same_old_pin_at_once_make_one_and_refuse_one(
    pinned,
):
    answers = await asyncio.gather(
        set_pin(pinned, "264819", currentPin=PIN),
        set_pin(pinned, "751936", currentPin=PIN),
    )

    assert sorted(a.status_code for a in answers) == [200, 409]
    assert {a.json()["detail"]["code"] for a in answers if a.status_code == 409} == {
        "pin_changed"
    }


async def test_a_row_with_an_iteration_count_outside_the_range_is_never_hashed_with(
    pinned, env, monkeypatch
):
    async def never(*_args, **_kwargs):
        raise AssertionError("hashed with a stored count that is out of range")

    monkeypatch.setattr("app.account.parent_pins.hash_pin", never)
    for bad in (1, 99_999, 100_001, 10**9):
        env.DB.connection.execute("UPDATE parent_pins SET iterations = ?", (bad,))
        answer = await typed(pinned, PIN)
        status = (await pinned.get(STATUS)).json()

        assert answer.json()["detail"]["code"] == "pin_not_set", bad
        assert status["hasPin"] is False


async def test_the_function_and_its_version_are_named_in_the_row_and_checked(
    pinned, env
):
    env.DB.connection.execute("UPDATE parent_pins SET kdf = 'scrypt'")
    assert (await typed(pinned, PIN)).json()["detail"]["code"] == "pin_not_set"

    env.DB.connection.execute(
        "UPDATE parent_pins SET kdf = 'pbkdf2-sha256', kdf_version = 2"
    )
    assert (await typed(pinned, PIN)).json()["detail"]["code"] == "pin_not_set"


async def test_after_the_secret_is_rotated_the_pin_is_not_set_and_no_attempt_is_burned(
    app, pinned, env
):
    # The secret itself is the sessions' key too, so it is the row's pepper that is made foreign.
    assert await parent_pins.status_of(env.DB, "a new secret", UID, 0) is None
    env.DB.connection.execute("UPDATE parent_pins SET pepper_id = 'a-rotated-pepper'")

    status = (await pinned.get(STATUS)).json()
    answers = [await typed(pinned, PIN) for _ in range(8)]

    assert status["hasPin"] is False
    assert {a.json()["detail"]["code"] for a in answers} == {"pin_not_set"}
    assert row(env)["failed_count"] == 0
    reset = await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")
    assert reset.status_code == 200
    assert (await typed(pinned, OTHER_PIN)).status_code == 200


# L5: what a child spamming the PIN cannot do to the parent


async def test_a_google_reset_works_when_the_budgets_are_spent(app, pinned):
    app.state.pin_limiter = Budget(allowed=False)

    reset = await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")

    assert reset.status_code == 200


def jti_of(http) -> str:
    token = http.headers["Authorization"].removeprefix("Bearer ")
    return verify(token, SECRET)["jti"]


async def test_the_budget_is_the_sessions_so_a_childs_spam_does_not_hold_the_parent(
    app, pinned
):
    class Spent:
        def __init__(self) -> None:
            self.keys: set[str] = set()

        async def allow(self, key: str) -> bool:
            return key not in self.keys

    limiter = app.state.pin_limiter = Spent()
    async with client(app) as parent_phone:
        await signed_in(parent_phone, firebaseIdToken="good")
        limiter.keys = {f"pin:session:{UID}:{jti_of(pinned)}"}
        child_refused = await typed(pinned, PIN)
        parent_ok = await typed(parent_phone, PIN)

    assert child_refused.json()["detail"]["code"] == "rate_limited"
    assert parent_ok.status_code == 200


# What the parent is told


def events(env) -> list[tuple]:
    return [
        (r["kind"], r["count"])
        for r in env.DB.rows("SELECT kind, count FROM pin_events ORDER BY id")
    ]


async def test_a_lock_the_pin_turning_off_and_a_reset_are_recorded(pinned, clock, env):
    for _ in range(3):
        await wrong_five(pinned)
        clock.advance(25 * 60 * MINUTE)
    await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")

    assert events(env) == [
        ("set", 0),
        ("wrong", 3),
        ("locked", 5),
        ("wrong", 3),
        ("locked", 5),
        ("wrong", 3),
        ("locked", 5),
        ("disabled", 15),
        ("reset", 0),
    ]


async def test_what_a_pin_let_through_is_recorded(pinned, env):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())

    await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    assert ("consent", None) in events(env)


async def test_any_session_reads_the_notice_and_only_a_google_one_clears_it(
    pinned, clock
):
    await wrong_five(pinned)
    listed = (await pinned.get(f"{STATUS}/activity")).json()["events"]
    assert [(e["kind"], e["count"]) for e in listed] == [("locked", 5), ("wrong", 3)]
    newest = max(e["id"] for e in listed)
    ack = {"upTo": newest}

    child_clear = await pinned.post(f"{STATUS}/activity/acknowledge", json=ack)
    clock.advance(15 * MINUTE)
    use(pinned, (await typed(pinned, PIN)).json())
    pin_clear = await pinned.post(f"{STATUS}/activity/acknowledge", json=ack)
    use(pinned, await as_parent_of(pinned))
    google_clear = await pinned.post(f"{STATUS}/activity/acknowledge", json=ack)
    after = (await pinned.get(f"{STATUS}/activity")).json()["events"]

    assert child_clear.status_code == 403
    assert (pin_clear.status_code, pin_clear.json()["detail"]["code"]) == (
        403,
        "google_sign_in_required",
    )
    assert google_clear.status_code == 204 and after == []


async def test_each_group_of_events_keeps_its_newest_two_hundred_and_not_the_others(
    pinned, env
):
    await wrong_five(pinned)
    now = int(time.time() * 1000)
    for _ in range(250):
        await pin_events.record(env.DB, UID, "tv_linked", now)

    kinds = [r["kind"] for r in env.DB.rows("SELECT kind FROM pin_events")]
    assert kinds.count("tv_linked") == 200
    # A child linking TVs does not push out the record of the wrong PINs.
    assert kinds.count("locked") == 1 and kinds.count("wrong") == 1


async def test_a_notice_shows_the_wrong_pins_and_the_tvs_linked_even_after_a_burst_of_tvs(
    pinned, env
):
    await wrong_five(pinned)
    now = int(time.time() * 1000)
    for _ in range(40):
        await pin_events.record(env.DB, UID, "tv_linked", now)

    shown = (await pinned.get(f"{STATUS}/activity")).json()["events"]

    kinds = [e["kind"] for e in shown]
    assert "locked" in kinds and "wrong" in kinds and "tv_linked" in kinds
    assert kinds.count("tv_linked") == 10


async def test_a_wrong_burst_of_three_is_recorded_even_below_a_lock(pinned, env):
    for _ in range(3):
        await typed(pinned, OTHER_PIN)

    assert events(env) == [("set", 0), ("wrong", 3)]


async def test_acknowledging_clears_only_what_the_page_showed(pinned, env, clock):
    await wrong_five(pinned)
    shown = (await pinned.get(f"{STATUS}/activity")).json()["events"]
    upto = max(e["id"] for e in shown)
    clock.advance(15 * MINUTE)
    await wrong_five(pinned)  # more happens after the page was drawn
    use(pinned, await as_parent_of(pinned))

    cleared = await pinned.post(f"{STATUS}/activity/acknowledge", json={"upTo": upto})
    left = (await pinned.get(f"{STATUS}/activity")).json()["events"]

    assert cleared.status_code == 204
    assert [e["kind"] for e in left] == ["locked", "wrong"]
    assert all(e["id"] > upto for e in left)


async def test_a_pin_let_through_is_shown_to_the_parent_too(pinned, env):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())
    await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    shown = (await pinned.get(f"{STATUS}/activity")).json()["events"]

    assert [e["kind"] for e in shown] == ["consent"]


async def test_deleting_the_account_deletes_its_events(pinned, env):
    await wrong_five(pinned)
    use(pinned, await as_parent_of(pinned))

    await pinned.delete("/api/account")

    assert env.DB.rows("SELECT * FROM pin_events") == []
