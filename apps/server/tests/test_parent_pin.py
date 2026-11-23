"""The parent PIN: setting it, typing it, the lockout, what ends a parent's session, and how a consent
records which gate was passed. docs/PARENT_PIN.md has the design.

The tests that send attempts "at once" with `asyncio.gather` show that the charge is one statement
that holds on its own: this runs on SQLite in one process, which finishes a statement before the
next starts, so it does not prove D1's atomicity or its behaviour across isolates. That rests on
the charge being a single guarded UPDATE, which D1 runs as one transaction."""

import asyncio
import hashlib
import logging
import time

import pytest
from consent_sign_ins import OTHER_UID, consent_app
from service_agreed import service_agreed
from signed_in import UID, as_parent, client, signed_in, use
from voice_worker import worker_env

from app.account import parent_pin_kdf, parent_pins
from app.account.directory import learner_key
from app.security.session import issue, verify

STATUS = "/api/account/parent-pin"
VERIFY = f"{STATUS}/verify"
PIN = "4827"
OTHER_PIN = "7391"
SECRET = "s"
MINUTE = 60 * 1000


class Clock:
    """The lockout's time, which starts now and moves when told; sessions keep real time."""

    def __init__(self) -> None:
        self.ms = int(time.time() * 1000)

    def advance(self, milliseconds: int) -> None:
        self.ms += milliseconds


@pytest.fixture
def clock(monkeypatch):
    ticking = Clock()
    monkeypatch.setattr("app.api.account_pin_routes.now_ms", lambda: ticking.ms)
    return ticking


class Budget:
    def __init__(self, allowed: bool = True) -> None:
        self.allowed, self.keys = allowed, []

    async def allow(self, key: str) -> bool:
        self.keys.append(key)
        return self.allowed


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env, clock):
    return consent_app(monkeypatch, env)


@pytest.fixture
async def phone(app):
    """The account's phone: signed in, no learner chosen, no PIN yet."""
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        yield http


@pytest.fixture
async def pinned(phone):
    """The same phone after the parent set the PIN with a sign-in just made; the session in use
    is still the account's."""
    parent = await set_pin(phone, PIN, firebaseIdToken="fresh")
    assert parent.status_code == 200, parent.text
    return phone


async def set_pin(http, pin: str, **proof):
    return await http.put(STATUS, json={"pin": pin, **proof})


async def typed(http, pin: str):
    return await http.post(VERIFY, json={"pin": pin})


def claims_of(response) -> dict:
    return verify(response.json()["token"], SECRET)


def row(env) -> dict:
    return env.DB.rows("SELECT * FROM parent_pins")[0]


# What the app is told before it asks


async def test_an_account_without_a_pin_says_so_and_nothing_more(phone):
    status = await phone.get(STATUS)

    assert status.json() == {"hasPin": False, "length": None, "lockedUntil": None}


async def test_the_status_says_how_long_the_pin_is_and_that_it_is_not_locked(pinned):
    status = await pinned.get(STATUS)

    assert status.json() == {"hasPin": True, "length": 4, "lockedUntil": None}


async def test_typing_a_pin_the_account_does_not_have_is_told_apart_for_the_app(phone):
    response = await typed(phone, PIN)

    assert (response.status_code, response.json()["detail"]["code"]) == (
        409,
        "pin_not_set",
    )


# Setting it


async def test_a_sign_in_just_made_sets_the_pin_and_makes_the_parent_session(phone):
    response = await set_pin(phone, "482761", firebaseIdToken="fresh")

    assert response.status_code == 200
    claims = claims_of(response)
    assert claims["par"] is True and claims["acct"] == UID and "sub" not in claims
    assert claims["gate"] == "google"
    assert (await phone.get(STATUS)).json()["length"] == 6


async def test_a_pin_may_be_eight_digits_and_no_longer_or_shorter(phone):
    assert (
        await set_pin(phone, "48271935", firebaseIdToken="fresh")
    ).status_code == 200
    for bad in ("482", "482719356", "48a7", "4 27", "", "４８２７"):
        refused = await set_pin(phone, bad, firebaseIdToken="fresh")
        assert refused.status_code == 422, bad


async def test_a_rejected_pin_is_not_echoed_back_or_logged(phone, caplog):
    with caplog.at_level(logging.DEBUG):
        refused = await set_pin(phone, "48x2", firebaseIdToken="fresh")

    assert refused.status_code == 422
    assert "48x2" not in refused.text and "48x2" not in caplog.text


@pytest.mark.parametrize("easy", ["0000", "1111", "1234", "4321", "123456", "98765432"])
async def test_a_run_or_a_repeat_is_not_accepted_as_a_pin(phone, easy):
    refused = await set_pin(phone, easy, firebaseIdToken="fresh")

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        422,
        "pin_too_easy",
    )


@pytest.mark.parametrize(
    ("token", "status", "code"),
    [
        (None, 401, "sign_in_stale"),
        ("good", 401, "sign_in_stale"),
        ("stale", 401, "sign_in_stale"),
        ("other", 403, "sign_in_other_account"),
        ("password", 403, "sign_in_not_google"),
        ("forged", 401, None),
    ],
)
async def test_without_a_google_sign_in_just_made_by_this_account_no_pin_is_set(
    phone, token, status, code
):
    proof = {} if token is None else {"firebaseIdToken": token}
    refused = await set_pin(phone, PIN, **proof)

    assert refused.status_code == status
    if code:
        assert refused.json()["detail"]["code"] == code
    assert (await phone.get(STATUS)).json()["hasPin"] is False


async def test_a_child_on_the_phone_cannot_set_the_pin_by_knowing_the_old_one_they_lack(
    phone, pinned
):
    refused = await set_pin(phone, OTHER_PIN)

    assert refused.status_code == 401
    assert (await typed(phone, PIN)).status_code == 200


async def test_the_pin_is_kept_as_a_salted_keyed_hash_and_nowhere_else(pinned, env):
    kept = row(env)

    assert kept["kdf"] == "pbkdf2-sha256" and kept["iterations"] == 100_000
    assert kept["pin_length"] == 4
    assert PIN not in str(kept)
    assert len(bytes.fromhex(kept["salt"])) == 16
    assert len(bytes.fromhex(kept["hash"])) == 32
    assert kept["hash"] != hashlib.sha256(PIN.encode()).hexdigest()
    assert not any(PIN in str(table) for table in env.DB.rows("SELECT * FROM consents"))


async def test_the_same_pin_of_two_accounts_or_set_twice_gives_different_hashes(
    app, env, phone
):
    await set_pin(phone, PIN, firebaseIdToken="fresh")
    first = row(env)["hash"]
    await set_pin(phone, PIN, firebaseIdToken="fresh")
    second = row(env)["hash"]
    async with client(app) as other:
        await signed_in(other, firebaseIdToken="good2")
        await set_pin(other, PIN, firebaseIdToken="other")
    third = env.DB.rows(
        "SELECT hash FROM parent_pins WHERE account_uid = ?", OTHER_UID
    )[0]["hash"]

    assert len({first, second, third}) == 3


async def test_the_hash_needs_the_servers_secret_so_a_copy_of_the_table_cannot_be_tried():
    salt = parent_pin_kdf.new_salt()
    kept = await parent_pin_kdf.hash_pin(
        parent_pin_kdf.pepper_of("one"), UID, PIN, salt
    )
    same = await parent_pin_kdf.hash_pin(
        parent_pin_kdf.pepper_of("one"), UID, PIN, salt
    )
    other_secret = await parent_pin_kdf.hash_pin(
        parent_pin_kdf.pepper_of("two"), UID, PIN, salt
    )
    bare = hashlib.pbkdf2_hmac("sha256", PIN.encode(), salt, 100_000, 32).hex()

    assert kept == same
    assert kept != other_secret and kept != bare
    assert parent_pin_kdf.pepper_of("one") != b"one"


async def test_the_pin_is_never_written_to_the_log(phone, caplog):
    with caplog.at_level(logging.DEBUG):
        await set_pin(phone, PIN, firebaseIdToken="fresh")
        await typed(phone, PIN)
        await typed(phone, OTHER_PIN)

    assert PIN not in caplog.text and OTHER_PIN not in caplog.text


# Typing it


async def test_the_right_pin_makes_the_parent_session_for_fifteen_minutes(pinned):
    response = await typed(pinned, PIN)

    assert response.status_code == 200
    claims = claims_of(response)
    assert claims["par"] is True and claims["acct"] == UID
    assert claims["gate"] == "pin" and "sub" not in claims
    assert response.json()["expiresIn"] == 15 * 60


async def test_the_session_made_from_the_pin_reaches_what_only_the_parent_may(
    pinned, env
):
    learner = (
        await pinned.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
    ).json()["id"]
    url = f"/api/account/learners/{learner}/voice"
    assert (await pinned.get(url)).status_code == 403
    use(pinned, (await typed(pinned, PIN)).json())

    assert (await pinned.get(url)).status_code == 200


async def test_a_childs_learner_session_is_not_a_parent_session_with_or_without_a_pin(
    pinned, env
):
    learner = await added_learner(pinned)
    await service_agreed(env, learner)
    child = await pinned.post(f"/api/account/learners/{learner}/session", json={})
    use(pinned, child.json())

    assert child.status_code == 200
    assert "par" not in verify(child.json()["token"], SECRET)
    denied = await pinned.get(f"/api/account/learners/{learner}/voice")
    assert denied.status_code == 403
    # What the child's session can do is ask for the parent's, which needs the PIN.
    assert (await typed(pinned, OTHER_PIN)).status_code == 403
    assert (await typed(pinned, PIN)).status_code == 200


async def test_a_wrong_pin_is_refused_with_the_attempts_left(pinned):
    answers = [await typed(pinned, OTHER_PIN) for _ in range(4)]

    assert [a.status_code for a in answers] == [403] * 4
    assert [a.json()["detail"]["attemptsLeft"] for a in answers] == [4, 3, 2, 1]
    assert {a.json()["detail"]["code"] for a in answers} == {"pin_wrong"}


async def test_a_wrong_pin_of_the_right_length_and_of_another_look_the_same(pinned):
    short = await typed(pinned, "482")
    assert short.status_code == 422
    wrong = await typed(pinned, OTHER_PIN)
    longer = await typed(pinned, "48271")

    assert wrong.status_code == longer.status_code == 403
    assert set(wrong.json()["detail"]) == set(longer.json()["detail"])


# The lockout


async def wrong_five(http):
    return [await typed(http, OTHER_PIN) for _ in range(5)]


async def test_five_wrong_pins_lock_the_account_for_fifteen_minutes(pinned, clock):
    answers = await wrong_five(pinned)

    last = answers[-1]
    assert [a.status_code for a in answers[:-1]] == [403] * 4
    assert last.status_code == 429
    assert last.json()["detail"]["code"] == "pin_locked"
    assert last.json()["detail"]["lockedUntil"] == clock.ms + 15 * MINUTE
    assert int(last.headers["Retry-After"]) == 15 * 60
    status = (await pinned.get(STATUS)).json()
    assert status["lockedUntil"] == clock.ms + 15 * MINUTE


async def test_while_locked_even_the_right_pin_is_turned_away(pinned, clock):
    await wrong_five(pinned)
    clock.advance(14 * MINUTE)

    right = await typed(pinned, PIN)

    assert (right.status_code, right.json()["detail"]["code"]) == (429, "pin_locked")
    assert "token" not in right.text


async def test_when_the_lock_ends_the_right_pin_works_and_clears_the_count(
    pinned, clock, env
):
    await wrong_five(pinned)
    clock.advance(15 * MINUTE)

    right = await typed(pinned, PIN)

    assert right.status_code == 200
    assert (
        row(env)["failed_count"],
        row(env)["lockouts"],
        row(env)["locked_until"],
    ) == (
        0,
        0,
        0,
    )


async def test_the_lock_grows_to_an_hour_and_then_a_day_and_a_right_pin_starts_again(
    pinned, clock
):
    locks = []
    for _ in range(4):
        last = (await wrong_five(pinned))[-1]
        locks.append(last.json()["detail"]["lockedUntil"] - clock.ms)
        clock.advance(locks[-1])

    assert locks == [15 * MINUTE, 60 * MINUTE, 24 * 60 * MINUTE, 24 * 60 * MINUTE]
    assert (await typed(pinned, PIN)).status_code == 200
    again = (await wrong_five(pinned))[-1]
    assert again.json()["detail"]["lockedUntil"] - clock.ms == 15 * MINUTE


async def test_a_wrong_pin_after_a_lock_counts_from_one_again(pinned, clock):
    await wrong_five(pinned)
    clock.advance(15 * MINUTE)

    again = await typed(pinned, OTHER_PIN)

    assert again.json()["detail"]["attemptsLeft"] == 4


async def test_a_new_session_or_a_new_phone_of_the_account_is_as_locked(
    app, pinned, clock
):
    await wrong_five(pinned)

    async with client(app) as another_phone:
        await signed_in(another_phone, firebaseIdToken="good")
        status = (await another_phone.get(STATUS)).json()
        refused = await typed(another_phone, PIN)
    fresh_session = await signed_in(pinned, firebaseIdToken="good")

    assert status["lockedUntil"] == clock.ms + 15 * MINUTE
    assert refused.status_code == 429
    assert fresh_session["signedIn"] is True
    assert (await typed(pinned, PIN)).status_code == 429


async def test_another_accounts_attempts_do_not_count_against_this_one(app, pinned):
    async with client(app) as other:
        await signed_in(other, firebaseIdToken="good2")
        await set_pin(other, PIN, firebaseIdToken="other")
        for _ in range(6):
            await typed(other, OTHER_PIN)

    assert (await typed(pinned, PIN)).status_code == 200


async def test_attempts_at_once_are_counted_each_and_only_five_are_compared(
    pinned, env, clock, monkeypatch
):
    compared = []
    real = parent_pin_kdf.hash_pin

    async def counting(*args, **kwargs):
        compared.append(1)
        return await real(*args, **kwargs)

    monkeypatch.setattr("app.account.parent_pins.hash_pin", counting)

    answers = await asyncio.gather(*(typed(pinned, OTHER_PIN) for _ in range(40)))

    codes = [a.json()["detail"]["code"] for a in answers]
    assert codes.count("pin_wrong") == 4
    assert codes.count("pin_locked") == 36
    assert len(compared) == 5
    assert (row(env)["failed_count"], row(env)["lockouts"]) == (0, 1)


async def test_a_right_pin_among_wrong_ones_at_once_is_the_only_way_in(
    pinned, monkeypatch
):
    answers = await asyncio.gather(
        *(typed(pinned, PIN if i == 2 else OTHER_PIN) for i in range(12))
    )

    assert [a.status_code for a in answers].count(200) == 1


async def test_an_attempt_cut_off_after_it_was_charged_stays_counted(
    pinned, env, monkeypatch
):
    async def cut_off(*_args, **_kwargs):
        raise asyncio.CancelledError

    monkeypatch.setattr("app.account.parent_pins.hash_pin", cut_off)
    with pytest.raises(asyncio.CancelledError):
        await typed(pinned, PIN)

    assert row(env)["failed_count"] == 1


# The budgets in front of it


async def test_a_typed_pin_spends_the_budget_of_the_account_and_of_the_source(
    app, pinned
):
    app.state.pin_limiter = budget = Budget()

    await typed(pinned, OTHER_PIN)

    assert budget.keys[0] == f"pin:account:{UID}"
    assert budget.keys[1].startswith("pin:source:") and len(budget.keys) == 2


async def test_when_a_budget_is_spent_the_attempt_is_refused_and_not_counted(
    app, pinned, env
):
    app.state.pin_limiter = Budget(allowed=False)

    refused = await typed(pinned, PIN)

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        429,
        "rate_limited",
    )
    assert refused.headers["Retry-After"] == "60"
    assert row(env)["failed_count"] == 0


async def test_proving_the_old_pin_to_change_it_spends_the_same_budgets(app, pinned):
    app.state.pin_limiter = budget = Budget()

    await set_pin(pinned, OTHER_PIN, currentPin=PIN)

    assert len(budget.keys) == 2


# Changing it, and forgetting it


async def test_the_old_pin_changes_the_pin_and_the_session_says_it_was_the_pin(pinned):
    changed = await set_pin(pinned, OTHER_PIN, currentPin=PIN)

    assert changed.status_code == 200 and claims_of(changed)["gate"] == "pin"
    assert (await typed(pinned, PIN)).status_code == 403
    assert (await typed(pinned, OTHER_PIN)).status_code == 200


async def test_a_wrong_old_pin_changes_nothing_and_is_counted_with_the_rest(
    pinned, env
):
    refused = await set_pin(pinned, "5926", currentPin=OTHER_PIN)

    assert (refused.status_code, refused.json()["detail"]["attemptsLeft"]) == (403, 4)
    assert row(env)["failed_count"] == 1
    assert (await typed(pinned, PIN)).status_code == 200


async def test_guessing_through_the_change_route_meets_the_same_lock(pinned, clock):
    answers = [await set_pin(pinned, "5926", currentPin=OTHER_PIN) for _ in range(5)]

    assert answers[-1].status_code == 429
    assert (await typed(pinned, PIN)).status_code == 429


async def test_changing_a_pin_that_was_never_set_with_a_pin_is_refused(phone):
    refused = await set_pin(phone, OTHER_PIN, currentPin=PIN)

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        409,
        "pin_not_set",
    )


async def test_forgot_pin_is_a_sign_in_just_made_and_it_ends_a_lock(pinned, clock):
    await wrong_five(pinned)

    reset = await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")

    assert reset.status_code == 200 and claims_of(reset)["gate"] == "google"
    status = (await pinned.get(STATUS)).json()
    assert status["lockedUntil"] is None
    assert (await typed(pinned, OTHER_PIN)).status_code == 200


async def test_setting_a_pin_ends_the_parent_sessions_made_before_it(pinned, env):
    learner = (
        await pinned.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
    ).json()["id"]
    url = f"/api/account/learners/{learner}/voice"
    old = (await typed(pinned, PIN)).json()
    google = await as_parent_of(pinned)
    for session in (old, google):
        use(pinned, session)
        assert (await pinned.get(url)).status_code == 200
    # A session made in the second of a reset is kept; these were made earlier than that.
    env.DB.connection.execute("UPDATE parent_pins SET set_at = set_at + 5000")

    for session in (old, google):
        use(pinned, session)
        refused = await pinned.get(url)
        assert refused.status_code == 403
        assert refused.json()["detail"]["code"] == "account_required"


async def as_parent_of(http) -> dict:
    response = await http.post(
        "/api/account/parent-session", json={"firebaseIdToken": "fresh"}
    )
    return response.json()


async def test_the_session_a_reset_makes_is_not_ended_by_that_reset(pinned, env):
    learner = (
        await pinned.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
    ).json()["id"]
    reset = await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")
    use(pinned, reset.json())

    assert (
        await pinned.get(f"/api/account/learners/{learner}/voice")
    ).status_code == 200


async def test_a_reset_leaves_the_tvs_of_the_account_signed_in(pinned, env):
    env.DB.connection.execute(
        "INSERT INTO tv_sessions (id, refresh_hash, account_uid, learner_id, label, "
        "created_at, last_used_at, expires_at) VALUES ('t1', 'h', ?, 'l', 'TV', 1, 1, ?)",
        (UID, 2**50),
    )

    await set_pin(pinned, OTHER_PIN, firebaseIdToken="fresh")

    assert env.DB.rows("SELECT revoked_at FROM tv_sessions") == [{"revoked_at": None}]


async def test_the_google_parent_session_still_works_where_there_is_no_pin(phone):
    learner = (
        await phone.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
    ).json()["id"]
    await as_parent(phone)

    assert (
        await phone.get(f"/api/account/learners/{learner}/voice")
    ).status_code == 200


async def test_deleting_the_account_deletes_its_pin(pinned, env):
    use(pinned, await as_parent_of(pinned))

    deleted = await pinned.delete("/api/account")

    assert deleted.status_code == 204
    assert env.DB.rows("SELECT * FROM parent_pins") == []


async def test_the_pin_does_not_stand_for_the_google_sign_in_that_deleting_needs(
    pinned, env
):
    use(pinned, (await typed(pinned, PIN)).json())

    refused = await pinned.delete("/api/account")

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        403,
        "google_sign_in_required",
    )
    assert env.DB.rows("SELECT * FROM parent_pins") != []


# A TV is never the parent


async def test_a_tv_session_reaches_no_pin_route(app, env):
    tv = issue(SECRET, account=UID, learner=learner_key(UID, "abc"), tv="credential")
    async with client(app) as http:
        http.headers["Authorization"] = f"Bearer {tv.token}"
        answers = [
            await http.get(STATUS),
            await http.post(VERIFY, json={"pin": PIN}),
            await http.put(STATUS, json={"pin": PIN, "firebaseIdToken": "fresh"}),
        ]

    assert [a.status_code for a in answers] == [403, 403, 403]
    assert {a.json()["detail"]["code"] for a in answers} == {"tv_session"}


async def test_without_a_session_there_is_nothing_to_ask(app):
    async with client(app) as http:
        answers = [await http.get(STATUS), await http.post(VERIFY, json={"pin": PIN})]

    assert [a.status_code for a in answers] == [401, 401]


# The gate a consent was given through


async def consent_of(env) -> dict:
    return env.DB.rows("SELECT scope, gate FROM consents WHERE revoked_at IS NULL")[0]


async def added_learner(http) -> str:
    created = await http.post(
        "/api/account/learners", json={"name": "Ada", "guardian": True}
    )
    return created.json()["id"]


async def test_a_recordings_consent_given_with_the_pin_records_the_pin_as_its_gate(
    pinned, env
):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())

    agreed = await pinned.put(
        f"/api/account/learners/{learner}/voice/consent",
        json={"noticeVersion": 1, "retentionDays": 30},
    )

    assert agreed.status_code == 200
    assert await consent_of(env) == {"scope": "recordings", "gate": "pin"}


async def test_a_recordings_consent_with_a_google_session_or_a_sign_in_records_google(
    phone, env
):
    learner = await added_learner(phone)
    await as_parent(phone)
    url = f"/api/account/learners/{learner}/voice/consent"

    first = await phone.put(url, json={"noticeVersion": 1, "retentionDays": 30})
    assert first.status_code == 200
    assert await consent_of(env) == {"scope": "recordings", "gate": "google"}

    use(phone, (await set_pin(phone, PIN, firebaseIdToken="fresh")).json())
    second = await phone.put(
        url,
        json={"noticeVersion": 1, "retentionDays": 90, "firebaseIdToken": "fresh"},
    )
    assert second.status_code == 200
    assert await consent_of(env) == {"scope": "recordings", "gate": "google"}


async def test_a_service_consent_with_the_pin_session_records_the_pin(pinned, env):
    learner = await added_learner(pinned)
    use(pinned, (await typed(pinned, PIN)).json())

    agreed = await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    assert agreed.status_code == 200
    assert await consent_of(env) == {"scope": "service", "gate": "pin"}


async def test_a_learner_added_with_consent_under_the_pin_session_records_the_pin(
    pinned, env
):
    use(pinned, (await typed(pinned, PIN)).json())

    created = await pinned.post(
        "/api/account/learners",
        json={"name": "Ada", "guardian": True, "consent": {"noticeVersion": 1}},
    )

    assert created.status_code == 201
    assert await consent_of(env) == {"scope": "service", "gate": "pin"}


async def test_a_service_consent_with_no_sign_in_and_no_parent_session_is_refused(
    pinned, env
):
    learner = await added_learner(pinned)

    refused = await pinned.put(
        f"/api/account/learners/{learner}/consent", json={"noticeVersion": 1}
    )

    assert (refused.status_code, refused.json()["detail"]["code"]) == (
        403,
        "account_required",
    )
    assert env.DB.rows("SELECT * FROM consents") == []


async def test_a_consent_the_old_way_with_a_sign_in_just_made_still_records_google(
    pinned, env
):
    created = await pinned.post(
        "/api/account/learners",
        json={
            "name": "Ada",
            "guardian": True,
            "consent": {"noticeVersion": 1, "firebaseIdToken": "fresh"},
        },
    )

    assert created.status_code == 201
    assert await consent_of(env) == {"scope": "service", "gate": "google"}


async def test_consents_given_before_the_gate_was_recorded_read_as_google(env):
    env.DB.connection.execute(
        "INSERT INTO consents (learner_key, account_uid, scope, notice_version, "
        "retention_days, granted_at) VALUES ('k', ?, 'service', 1, NULL, 1)",
        (UID,),
    )

    assert env.DB.rows("SELECT gate FROM consents") == [{"gate": "google"}]


# The session's claims


def test_a_parent_session_names_the_gate_and_one_without_it_cannot_be_made():
    for gate in ("pin", "google"):
        issued = issue(SECRET, account=UID, parent=True, gate=gate)
        assert verify(issued.token, SECRET)["gate"] == gate
    with pytest.raises(ValueError):
        issue(SECRET, account=UID, parent=True)
    with pytest.raises(ValueError):
        issue(SECRET, account=UID, parent=True, gate="face")


def test_a_session_that_is_not_a_parent_s_names_no_gate():
    from app.security.session import gate_of

    assert gate_of(verify(issue(SECRET, account=UID).token, SECRET)) is None


def test_a_parent_session_made_before_the_claim_existed_reads_as_google():
    from app.security.session import gate_of

    assert gate_of({"par": True, "exp": 1}) == "google"
    assert gate_of({"par": True, "gate": "face", "exp": 1}) == "google"


def test_the_checks_of_the_pin_match_the_standard_derivation():
    pepper = parent_pin_kdf.pepper_of("secret")
    salt = bytes(range(16))
    keyed = parent_pin_kdf._keyed(pepper, UID, PIN)

    assert parent_pin_kdf._in_python(keyed, salt, 1000) == hashlib.pbkdf2_hmac(
        "sha256", keyed, salt, 1000, 32
    )
    assert parent_pin_kdf.same_hash("ab", "ab")
    assert not parent_pin_kdf.same_hash("ab", "ac")


def test_the_lock_lengths_are_fifteen_minutes_an_hour_and_a_day():
    assert parent_pins.MAX_FAILURES == 5
    assert parent_pins.LOCK_MS == (15 * MINUTE, 60 * MINUTE, 24 * 60 * MINUTE)
