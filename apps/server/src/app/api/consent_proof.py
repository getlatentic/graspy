"""What a request must show for a consent to be recorded: a notice graspy shows, and the parent's
own proof, so a session left open on a device cannot agree for them. The proof is a parent's
session (made by typing the parent PIN, or by signing in with Google again) or a fresh sign-in
with Google sent with the request; which one it was is kept with the consent."""

from __future__ import annotations

import time

from fastapi import HTTPException, Request

from ..account import parent_pins
from ..account.consents import GATE_GOOGLE
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


async def require_fresh_sign_in(request: Request, uid: str, id_token: str) -> SignedIn:
    """The token is Google's for this session's own account, came from signing in with Google,
    and its sign-in is recent. Returns who signed in."""
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


async def consent_gate(
    request: Request, session: Session, uid: str, id_token: str | None
) -> str:
    """Proves the parent agreed, and says how: a fresh sign-in with Google sent with the request,
    or else the parent's session the request is made under."""
    if id_token is not None:
        await require_fresh_sign_in(request, uid, id_token)
        return GATE_GOOGLE
    gate = await parent_gate(request, session)
    if gate is None or session.account != uid:
        raise parent_required()
    return gate
