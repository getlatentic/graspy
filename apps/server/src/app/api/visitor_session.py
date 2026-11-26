"""The session of a visitor with no account (the web's /try), minted only for a browser that passed
Cloudflare's Turnstile challenge. The session lasts 12 hours and is renewed with the same visitor id,
and a renewal must not challenge the child again: it presents the session it replaces, and the
challenge's time (`cha`) is carried across, for up to VISITOR_CHALLENGE_MAX_AGE_SECONDS from the
challenge that was passed. Tokens are single use, so the web asks for a new challenge only when it has
no renewable session. The turn limits (api/anonymous_chat.py) hold as before."""

from __future__ import annotations

import logging
import time

from fastapi import HTTPException, Request

from ..security.session import (
    VISITOR_CHALLENGE_MAX_AGE_SECONDS,
    VISITOR_MAX_RENEWALS,
    InvalidSessionToken,
    challenged_at_of,
    issue,
    renewals_of,
    verify,
    visitor_of,
)
from ..security.turnstile import (
    ChallengeRefused,
    ChallengeUnchecked,
    verify_challenge,
)
from .anonymous_chat import edge_address

logger = logging.getLogger(__name__)

CHALLENGE_REQUIRED = "challenge_required"
CHALLENGE_FAILED = "challenge_failed"
CHALLENGE_UNAVAILABLE = "challenge_unavailable"


def _refusal(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": message, "code": code})


def _carried_challenge(
    renewal: str | None, visitor: str, secret: str, now: float
) -> tuple[int, int] | None:
    """When the challenge of the session being renewed was passed, and how many sessions now
    descend from it, if the session is this visitor's, still valid, recent enough and not renewed
    too often to carry on."""
    if not renewal:
        return None
    try:
        claims = verify(renewal, secret, now=now)
    except InvalidSessionToken:
        return None
    passed = challenged_at_of(claims)
    if passed is None or visitor_of(claims) != visitor:
        return None
    if not 0 <= now - passed <= VISITOR_CHALLENGE_MAX_AGE_SECONDS:
        return None
    renewals = renewals_of(claims) + 1
    return (passed, renewals) if renewals <= VISITOR_MAX_RENEWALS else None


async def _passed_challenge(request: Request, token: str | None) -> None:
    if not token:
        raise _refusal(403, CHALLENGE_REQUIRED, "Reload the page to start.")
    settings = request.app.state.settings
    try:
        await verify_challenge(
            token,
            settings.turnstile_secret,
            client_address=edge_address(request.headers),
            origin_allowed=request.app.state.origin_allowed,
        )
    except ChallengeRefused as refused:
        raise _refusal(
            403, CHALLENGE_FAILED, "That check did not pass. Try again."
        ) from refused
    except ChallengeUnchecked as unchecked:
        raise _refusal(
            503, CHALLENGE_UNAVAILABLE, "The check could not be made. Try again."
        ) from unchecked


async def visitor_session(
    request: Request,
    visitor: str,
    *,
    challenge: str | None,
    renewal: str | None,
):
    """The token of a visitor whose browser has passed the challenge, or whose session carries one.
    With no TURNSTILE_SECRET (development only: a deployed server refuses to start without it) the
    session is minted unchallenged."""
    secret = request.app.state.session_secret
    now = time.time()
    challenged_at: int | None = None
    renewals = 0
    if request.app.state.settings.turnstile_secret:
        carried = _carried_challenge(renewal, visitor, secret, now)
        if carried is None:
            await _passed_challenge(request, challenge)
            carried = (int(now), 0)
        challenged_at, renewals = carried
    return issue(
        secret,
        visitor=visitor,
        challenged_at=challenged_at,
        renewals=renewals,
        now=now,
    )
