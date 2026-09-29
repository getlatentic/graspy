"""What a request must show for a consent to be recorded: a notice graspy shows, and the parent's
own fresh sign-in, so a session left open on a device cannot agree for them."""

from __future__ import annotations

import time

from fastapi import HTTPException, Request

from ..security.firebase import FRESH_SIGN_IN_SECONDS
from .routes import verified_sign_in


def refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


def require_known_notice(known: frozenset[int], version: int) -> None:
    if version not in known:
        raise refusal(400, "notice_unknown", "That notice is not one graspy shows")


async def require_fresh_sign_in(request: Request, uid: str, id_token: str) -> None:
    """The token is Google's for this session's own account, and its sign-in is recent."""
    signed = await verified_sign_in(request, id_token)
    if signed.uid != uid:
        raise refusal(
            403, "sign_in_other_account", "That sign-in is not this account's"
        )
    if not signed.signed_in_within(FRESH_SIGN_IN_SECONDS, time.time()):
        raise refusal(
            401, "sign_in_stale", "Sign in again to agree, then send the new token"
        )
