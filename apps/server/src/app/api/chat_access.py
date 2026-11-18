"""The tutor chat is for a signed-in account's learner. A device's own session has no account and
no parent who agreed, so the chat turns it away; an account that has not chosen a learner has
nobody for the chat to talk to. Past that, the parent's service consent applies as everywhere.

The learner's record, lessons and voice stay open to a device: only the chat asks for an account."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request

from ..account.directory import learner_key
from ..security.guard import Session, require_session
from .service_consent import service_consent_refusal

ACCOUNT_REQUIRED = "account_required"
LEARNER_REQUIRED = "learner_required"


def _refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


async def chat_refusal(app: Any, session: Session) -> HTTPException | None:
    """None when the session may chat, else the refusal to send."""
    if not session.account:
        return _refusal(403, ACCOUNT_REQUIRED, "Sign in to chat")
    own = learner_key(session.account, "")
    if not session.learner or not session.learner.startswith(own):
        return _refusal(409, LEARNER_REQUIRED, "Choose a learner first")
    return await service_consent_refusal(app, session.learner)


async def require_chat(
    request: Request, session: Annotated[Session, Depends(require_session)]
) -> Session:
    refusal = await chat_refusal(request.app, session)
    if refusal is not None:
        raise refusal
    return session


ChatSession = Annotated[Session, Depends(require_chat)]
