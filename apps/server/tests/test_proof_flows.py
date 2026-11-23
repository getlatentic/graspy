# ruff: noqa: F811
"""One real Google sign-in makes an account session and then proves once, as the three-step TV link
and the PIN reset send one token to two endpoints (docs/PARENT_PIN.md, Google proofs), and the
test stand-in for Google that every other test leans on never repeats or goes backwards."""

import time

import fresh_sign_in
import pytest
from signed_in import client, signed_in, use
from test_parent_pin import (  # noqa: F401  (fixtures)
    PIN,
    SECRET,
    STATUS,
    app,
    clock,
    env,
    one_clock,
    phone,
    pinned,
    typed,
)

from app.security.session import verify

PARENT_SESSION = "/api/account/parent-session"


def reused(response) -> bool:
    return (
        response.status_code == 401
        and response.json()["detail"]["code"] == "sign_in_reused"
    )


async def test_one_sign_in_makes_the_session_then_proves_once_for_the_parent_session(
    app,
):
    async with client(app) as http:
        minted = await signed_in(http, firebaseIdToken="at:0")
        # Minting again from the same token (a renewal) proves nothing and spends nothing.
        await signed_in(http, firebaseIdToken="at:0")

        parent = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:0"})
        again = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:0"})
        set_pin = await http.put(STATUS, json={"pin": PIN, "firebaseIdToken": "at:0"})

    assert minted["signedIn"] is True
    assert parent.status_code == 200 and reused(again) and reused(set_pin)
    assert verify(parent.json()["token"], SECRET)["gate"] == "google"


async def test_the_same_one_sign_in_may_instead_prove_once_for_the_pin(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="at:0")

        set_pin = await http.put(STATUS, json={"pin": PIN, "firebaseIdToken": "at:0"})
        parent = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:0"})
        use(http, set_pin.json())
        verified = await typed(http, PIN)

    assert set_pin.status_code == 200 and reused(parent)
    assert verified.status_code == 200


async def test_equality_with_the_sign_in_the_session_was_made_from_holds_in_the_same_second(
    app, one_clock
):
    """The session was made in the very second of the sign-in (`auth_time == iat`): not later than
    the session, but the sign-in it was made from, which is taken once."""
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="at:0")

        first = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:0"})
        second = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:0"})

    assert first.status_code == 200 and reused(second)


async def test_a_sign_in_made_after_the_session_proves_without_being_its_origin(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="at:0")

        later = await http.post(PARENT_SESSION, json={"firebaseIdToken": "at:2"})

    assert later.status_code == 200


# The test stand-in for Google


def test_the_stand_in_never_repeats_and_never_goes_backwards(monkeypatch):
    fresh_sign_in.reset()
    now = [1_800_000_000.0]
    monkeypatch.setattr(time, "time", lambda: now[0])

    made = [fresh_sign_in.fresh_auth_time()]
    now[0] += 0.2  # the same second
    made.append(fresh_sign_in.fresh_auth_time())
    now[0] -= 500  # a test that sets the clock back
    made.append(fresh_sign_in.fresh_auth_time())
    now[0] += 900
    made.append(fresh_sign_in.fresh_auth_time())

    assert made == sorted(set(made)) and len(made) == 4


def test_the_stand_in_is_later_than_a_session_made_in_the_same_second(monkeypatch):
    fresh_sign_in.reset()
    monkeypatch.setattr(time, "time", lambda: 1_800_000_000.9)

    assert fresh_sign_in.fresh_auth_time() > 1_800_000_000


@pytest.mark.parametrize("round_", range(3))
async def test_several_proofs_in_one_test_are_all_taken(pinned, round_):
    """parent_headers makes a proof each time: three in a row, in one second, all work."""
    from signed_in import parent_headers

    for _ in range(3):
        assert "Authorization" in await parent_headers(pinned)
