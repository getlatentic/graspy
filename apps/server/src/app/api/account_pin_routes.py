"""The parent PIN: what a parent types, in place of signing in with Google again, to be the parent
for fifteen minutes (docs/PARENT_PIN.md). Only an account's own session reaches these, a child's
included, and a TV's never does.

Setting a PIN, or replacing a forgotten one, needs a sign-in with Google just made, so a child on
a shared phone cannot. Changing it needs the old PIN or that sign-in. The lockout is the account's
(account/parent_pins.py), and the request budgets here only slow what arrives before it."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field

from ..account import parent_pins, pin_events, tv_sessions
from ..account.consents import GATE_GOOGLE, GATE_PIN
from ..account.parent_pin_kdf import PIN_PATTERN, too_easy
from ..account.tv_codes import masked_email
from ..learner.time import now_ms
from ..security.guard import Session, require_session
from ..security.rate_limit import client_key, source_of
from ..wire import Wire
from .account_parent_routes import parent_session_response
from .account_routes import Uid
from .budget import spend
from .consent_proof import refusal, require_fresh_sign_in
from .parent_access import GoogleParentUid
from .routes import SessionResponse

parent_pin_router = APIRouter(prefix="/account/parent-pin", tags=["parent pin"])

Pin = Annotated[str, Field(pattern=PIN_PATTERN)]


class PinStatus(Wire):
    has_pin: bool
    # How many digits the PIN has, so the pad can send it when the last is typed.
    length: int | None
    # When the lock ends, in milliseconds since the epoch, or null when the account is not locked.
    locked_until: int | None
    # Too many wrong PINs since the last Google proof: only Forgot PIN works.
    disabled: bool


class PinAttempt(Wire):
    pin: Pin


class NewPin(Wire):
    """The PIN to set, and the proof that the person may: a Google sign-in just made, or the PIN
    being replaced."""

    pin: Pin
    firebase_id_token: str | None = Field(default=None, max_length=4096)
    current_pin: Pin | None = None


class PinSession(SessionResponse):
    # TVs that were linked with the old PIN and are signed out by a reset with Google.
    tvs_signed_out: int = Field(default=0, serialization_alias="tvsSignedOut")


class PinEvent(Wire):
    id: int
    kind: str
    at: int
    count: int | None


class PinActivity(Wire):
    events: list[PinEvent]


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


async def _spend(request: Request, uid: str, session: Session) -> None:
    """The budgets of this session and of the source, before the lockout is touched. They are not
    the account's: a child spending the account's would hold the parent at `rate_limited`; the
    lockout is what is the account's."""
    limiter = request.app.state.pin_limiter
    await spend(limiter, f"pin:session:{uid}:{session.jti}")
    await spend(limiter, f"pin:source:{source_of(client_key(request.scope))}")


async def _proved_by_pin(
    request: Request, uid: str, session: Session, pin: str
) -> parent_pins.Correct:
    """Charges an attempt and compares. Anything but the PIN is the answer the app shows."""
    await _spend(request, uid, session)
    outcome = await parent_pins.check(
        _database(request), request.app.state.session_secret, uid, pin, now_ms()
    )
    match outcome:
        case parent_pins.Correct():
            return outcome
        case parent_pins.Locked(until=until):
            raise _locked(until)
        case parent_pins.Disabled():
            raise refusal(403, "pin_disabled", "The PIN is turned off: use Forgot PIN")
        case parent_pins.Wrong(attempts_left=left):
            raise _wrong(left)
        case _:
            raise refusal(409, "pin_not_set", "No PIN is set")


@parent_pin_router.get("", response_model=PinStatus)
async def pin_status(request: Request, uid: Uid) -> PinStatus:
    status = await parent_pins.status_of(
        _database(request), request.app.state.session_secret, uid, now_ms()
    )
    if status is None:
        return PinStatus(has_pin=False, length=None, locked_until=None, disabled=False)
    return PinStatus(
        has_pin=True,
        length=status.length,
        locked_until=status.locked_until or None,
        disabled=status.disabled,
    )


@parent_pin_router.post("/verify", response_model=SessionResponse)
async def verify_pin(
    request: Request,
    uid: Uid,
    session: Annotated[Session, Depends(require_session)],
    body: PinAttempt,
) -> SessionResponse:
    """The parent's session, for the right PIN."""
    correct = await _proved_by_pin(request, uid, session, body.pin)
    return parent_session_response(request, uid, GATE_PIN, correct.hint)


@parent_pin_router.put("", response_model=PinSession)
async def set_pin(
    request: Request,
    uid: Uid,
    session: Annotated[Session, Depends(require_session)],
    body: NewPin,
) -> PinSession:
    """Sets the PIN, or replaces it, and answers with the parent's session. Parent sessions made
    before are ended. A reset with Google also signs out the TVs that were linked with the PIN; TVs
    linked with Google stay."""
    if too_easy(body.pin):
        raise refusal(422, "pin_too_easy", "Choose a PIN that is not easy to guess")
    database, secret, now = (
        _database(request),
        request.app.state.session_secret,
        now_ms(),
    )
    tvs = 0
    if body.firebase_id_token is not None:
        signed = await require_fresh_sign_in(request, uid, body.firebase_id_token)
        gate, hint = GATE_GOOGLE, masked_email(signed.email)
        existed = await parent_pins.exists(database, uid)
        await parent_pins.save(database, secret, uid, body.pin, hint, now)
        if existed:
            tvs = await tv_sessions.revoke_pin_gated(database, uid, now)
        await pin_events.record(database, uid, "reset" if existed else "set", now, tvs)
    elif body.current_pin is not None:
        correct = await _proved_by_pin(request, uid, session, body.current_pin)
        gate, hint = GATE_PIN, correct.hint
        if not await parent_pins.change(
            database, secret, uid, body.pin, correct.hash, now
        ):
            raise refusal(409, "pin_changed", "The PIN was changed meanwhile")
        await pin_events.record(database, uid, "set", now)
    else:
        raise refusal(401, "sign_in_stale", "Sign in with Google to set the PIN")
    issued = parent_session_response(request, uid, gate, hint)
    return PinSession(**issued.model_dump(), tvs_signed_out=tvs)


@parent_pin_router.get("/activity", response_model=PinActivity)
async def pin_activity(request: Request, uid: Uid) -> PinActivity:
    """What a parent has not yet seen of their PIN: wrong PINs that locked it, it turned off, a
    reset. Any session of the account may read it, a child's too, which is no harm; only a
    parent's Google session clears it."""
    found = await pin_events.unread(_database(request), uid)
    return PinActivity(events=[PinEvent(**row) for row in found])


@parent_pin_router.post("/activity/acknowledge", status_code=204)
async def acknowledge_activity(request: Request, uid: GoogleParentUid) -> None:
    await pin_events.acknowledge(_database(request), uid, now_ms())
