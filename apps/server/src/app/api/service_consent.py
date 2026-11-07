"""A learner is served only once a parent has agreed to graspy teaching them. The learner's
session, tutor, lesson and voice routes ask here; the answer is one code, `consent_required`.

A session that names no account learner (a device's own, or an account's before it chose one) has
no parent to ask and passes. Where no consent store is bound (local runs and tests) nothing can be
checked and nothing is refused. A store that cannot be read refuses with 503: a child is not
served on a guess."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request

from ..account.consents import SERVICE, active_consent
from ..security.guard import Session, require_session

logger = logging.getLogger(__name__)

CONSENT_REQUIRED = "consent_required"
CONSENT_UNAVAILABLE = "consent_unavailable"


def _refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


async def service_consent_refusal(app: Any, learner_key: str) -> HTTPException | None:
    """None when the learner may be served, else the refusal to send."""
    voice = app.state.voice
    if voice is None:
        return None
    try:
        agreed = await active_consent(voice.DB, learner_key, SERVICE)
    except Exception:
        logger.exception("Whether a parent agreed could not be read")
        return _refusal(
            503, CONSENT_UNAVAILABLE, "Consent cannot be checked now. Try again"
        )
    if agreed is None:
        return _refusal(
            403,
            CONSENT_REQUIRED,
            "A parent has not agreed to graspy teaching this learner",
        )
    return None


async def session_consent_refusal(app: Any, session: Session) -> HTTPException | None:
    if not session.account or not session.learner:
        return None
    return await service_consent_refusal(app, session.learner)


async def require_service_consent(
    request: Request, session: Annotated[Session, Depends(require_session)]
) -> Session:
    refusal = await session_consent_refusal(request.app, session)
    if refusal is not None:
        raise refusal
    return session


ConsentedSession = Annotated[Session, Depends(require_service_consent)]
