"""The parent PIN: what a parent types, in place of signing in with Google again, to be the parent
for fifteen minutes (docs/PARENT_PIN.md). Only an account's own session reaches these, a child's
included, and a TV's never does.

Setting a PIN, or replacing a forgotten one, needs a sign-in with Google just made, so a child on
a shared phone cannot. Changing it needs the old PIN or that sign-in. The lockout is the account's
(account/parent_pins.py), and the request budgets here only slow what arrives before it."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field

from ..account import parent_pins
from ..account.consents import GATE_GOOGLE, GATE_PIN
from ..account.parent_pin_kdf import PIN_PATTERN, too_easy
from ..account.tv_codes import masked_email
from ..learner.time import now_ms
from ..security.rate_limit import client_key, source_of
from ..wire import Wire
from .account_parent_routes import parent_session_response
from .account_routes import Uid
from .budget import spend
from .consent_proof import refusal, require_fresh_sign_in
from .routes import SessionResponse

parent_pin_router = APIRouter(prefix="/account/parent-pin", tags=["parent pin"])

Pin = Annotated[str, Field(pattern=PIN_PATTERN)]


class PinStatus(Wire):
    has_pin: bool
    # How many digits the PIN has, so the pad can send it when the last is typed.
    length: int | None
    # When the lock ends, in milliseconds since the epoch, or null when the account is not locked.
    locked_until: int | None


class PinAttempt(Wire):
    pin: Pin


class NewPin(Wire):
    """The PIN to set, and the proof that the person may: a Google sign-in just made, or the PIN
    being replaced."""

    pin: Pin
    firebase_id_token: str | None = Field(default=None, max_length=4096)
    current_pin: Pin | None = None


def _database(request: Request):
    return request.app.state.tv_db


def _locked(until: int) -> HTTPException:
    seconds = max(1, (until - now_ms() + 999) // 1000)
    return HTTPException(
        status_code=429,
        detail={
            "error": "Too many wrong PINs",
            "code": "pin_locked",
            "lockedUntil": until,
        },
        headers={"Retry-After": str(seconds)},
    )


def _wrong(left: int) -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={
            "error": "That is not the PIN",
            "code": "pin_wrong",
            "attemptsLeft": left,
        },
    )


async def _spend(request: Request, uid: str) -> None:
    """The budgets of the account and of the source, before the lockout is touched."""
    limiter = request.app.state.pin_limiter
    await spend(limiter, f"pin:account:{uid}")
    await spend(limiter, f"pin:source:{source_of(client_key(request.scope))}")


async def _proved_by_pin(request: Request, uid: str, pin: str) -> parent_pins.Correct:
    """Charges an attempt and compares. Anything but the PIN is the answer the app shows."""
    await _spend(request, uid)
    outcome = await parent_pins.check(
        _database(request), request.app.state.session_secret, uid, pin, now_ms()
    )
    match outcome:
        case parent_pins.Correct():
            return outcome
        case parent_pins.Locked(until=until):
            raise _locked(until)
        case parent_pins.Wrong(locked_until=until) if until:
            raise _locked(until)
        case parent_pins.Wrong(attempts_left=left):
            raise _wrong(left)
        case _:
            raise refusal(409, "pin_not_set", "No PIN is set")


@parent_pin_router.get("", response_model=PinStatus)
async def pin_status(request: Request, uid: Uid) -> PinStatus:
    status = await parent_pins.status_of(_database(request), uid, now_ms())
    if status is None:
        return PinStatus(has_pin=False, length=None, locked_until=None)
    return PinStatus(
        has_pin=True, length=status.length, locked_until=status.locked_until or None
    )


@parent_pin_router.post("/verify", response_model=SessionResponse)
async def verify_pin(request: Request, uid: Uid, body: PinAttempt) -> SessionResponse:
    """The parent's session, for the right PIN."""
    correct = await _proved_by_pin(request, uid, body.pin)
    return parent_session_response(request, uid, GATE_PIN, correct.hint)


@parent_pin_router.put("", response_model=SessionResponse)
async def set_pin(
    request: Request,
    uid: Uid,
    body: NewPin,
) -> SessionResponse:
    """Sets the PIN, or replaces it, and answers with the parent's session. Parent sessions made
    before are ended; TVs signed in from this account are not."""
    if too_easy(body.pin):
        raise refusal(422, "pin_too_easy", "Choose a PIN that is not a run or a repeat")
    if body.firebase_id_token is not None:
        signed = await require_fresh_sign_in(request, uid, body.firebase_id_token)
        gate, hint = GATE_GOOGLE, masked_email(signed.email)
    elif body.current_pin is not None:
        correct = await _proved_by_pin(request, uid, body.current_pin)
        gate, hint = GATE_PIN, correct.hint
    else:
        raise refusal(401, "sign_in_stale", "Sign in with Google to set the PIN")
    await parent_pins.save(
        _database(request),
        request.app.state.session_secret,
        uid,
        body.pin,
        hint,
        now_ms(),
    )
    return parent_session_response(request, uid, gate, hint)
