"""What a request must show for a consent to be recorded: a notice graspy shows, and the parent's
own proof, so a session left open on a device cannot agree for them. The proof is a parent's
session (made by typing the parent PIN, or by signing in with Google again) or a fresh sign-in
with Google sent with the request; which one it was is kept with the consent."""

from __future__ import annotations

import time
from typing import NamedTuple

from fastapi import HTTPException, Request

from ..account import google_proofs, parent_pins
from ..account.consents import GATE_GOOGLE, GATE_GOOGLE_TOKEN
from ..security.firebase import FRESH_SIGN_IN_SECONDS, SignedIn
from ..security.guard import Session
from .routes import verified_sign_in

GOOGLE = "google.com"


def refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


def parent_required() -> HTTPException:
    return refusal(403, "account_required", "Prove you are the parent to do this")


def require_known_notice(known: frozenset[int], version: int) -> None:
    if version not in known:
        raise refusal(400, "notice_unknown", "That notice is not one graspy shows")


def sign_in_reused() -> HTTPException:
    return refusal(
        401,
        "sign_in_reused",
        "Sign in with Google again to do this, then send the new token",
    )


async def require_fresh_sign_in(
    request: Request, uid: str, id_token: str, session: Session | None = None
) -> SignedIn:
    """The token is Google's for this session's own account, came from signing in with Google,
    its sign-in is recent, and **it has not proved before**: a token proves once (its `auth_time`
    must be later than the last this account proved by), so one read off a device cannot be sent
    again. Made under a session, it must be a sign-in later than the session was made, or the one
    the session was minted from (a sign-in that makes the account's session and the parent's in
    one go, which is then spent). Returns who signed in."""
    signed = await verified_sign_in(request, id_token)
    if signed.uid != uid:
        raise refusal(
            403, "sign_in_other_account", "That sign-in is not this account's"
        )
    if signed.provider != GOOGLE:
        raise refusal(403, "sign_in_not_google", "Consent needs a sign-in with Google")
    if not signed.signed_in_within(FRESH_SIGN_IN_SECONDS, time.time()):
        raise refusal(
            401, "sign_in_stale", "Sign in again to agree, then send the new token"
        )
    assert signed.auth_time is not None
    if session is not None and not (
        signed.auth_time > (session.started_at or 0)
        or signed.auth_time == session.auth_time
    ):
        raise sign_in_reused()
    if not await google_proofs.accept(request.app.state.tv_db, uid, signed.auth_time):
        raise sign_in_reused()
    return signed


async def parent_gate(request: Request, session: Session) -> str | None:
    """How the parent proved themselves, if the session is a parent's and still in force; None
    otherwise. A parent's session made before the account's PIN was last set is not in force:
    setting a PIN ends them."""
    if not session.account or not session.parent or session.started_at is None:
        return None
    began = await parent_pins.set_at(request.app.state.tv_db, session.account)
    if began is not None and (session.started_at + 1) * 1000 <= began:
        return None
    return session.gate


# A parent's session that has been in force longer than this is not proof of an agreement: a child
# handed an unlocked phone within the 15 minutes must not be able to tap "I agree". The app asks
# for the PIN again at the consent step.
CONSENT_FRESH_SECONDS = 2 * 60


class Proof(NamedTuple):
    """How a parent agreed, and when they proved themselves, in milliseconds."""

    gate: str
    proved_at: int | None


def _google_time(session: Session) -> int | None:
    """When the Google sign-in behind a Google parent's session was done, in milliseconds."""
    when = session.auth_time or session.started_at
    return None if when is None else when * 1000


async def consent_gate(
    request: Request, session: Session, uid: str, id_token: str | None
) -> Proof:
    """Proves the parent agreed, and says how: a fresh sign-in with Google sent with the request,
    or else the parent's session the request is made under, if it began in the last two minutes."""
    gate = await parent_gate(request, session)
    if id_token is not None:
        signed = await require_fresh_sign_in(request, uid, id_token, session)
        proved = signed.auth_time * 1000 if signed.auth_time else None
        # A bare token, with no parent's session: it shows a sign-in was made, no more.
        return Proof(GATE_GOOGLE if gate else GATE_GOOGLE_TOKEN, proved)
    if gate is None or session.account != uid:
        raise parent_required()
    started = session.started_at
    if started is None or time.time() - started > CONSENT_FRESH_SECONDS:
        raise refusal(
            403,
            "parent_fresh_required",
            "Type the parent PIN again to agree",
        )
    return Proof(gate, _google_time(session) if gate == GATE_GOOGLE else started * 1000)
