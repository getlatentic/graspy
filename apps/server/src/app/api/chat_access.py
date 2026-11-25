"""Who may use the tutor chat: a signed-in account's learner, once a parent has agreed, and a visitor
with no account (the web's /try). A visitor's turns are counted and limited (anonymous_chat.py) and
keep no learner record (turns/access.py `chat_learner`). An account that has chosen no learner has
nobody for the chat to talk to.

The learner's record, lessons and voice stay open to a device: only the chat asks anything of one."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request

from ..account.directory import learner_key
from ..security.guard import Session, require_session
from .anonymous_chat import anonymous_turn_refusal
from .service_consent import service_consent_refusal

LEARNER_REQUIRED = "learner_required"


def _refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


async def chat_refusal(app: Any, session: Session) -> HTTPException | None:
    """None when the session may chat, else the refusal to send."""
    if not session.account:
        return None
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


async def require_turn_start(request: Request, session: ChatSession) -> Session:
    """Starting a turn spends model credits, which a visitor with no account is limited in."""
    refusal = await anonymous_turn_refusal(request.app, session, request.scope)
    if refusal is not None:
        raise refusal
    return session


StartingSession = Annotated[Session, Depends(require_turn_start)]
