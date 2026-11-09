"""The parent's own session. What only the parent may do, such as hearing a learner's kept
recordings, needs it: a session that carries the account and no learner, made from a Google
sign-in done just now, and short-lived. A child's session carries the same account, so the
account alone does not tell the two apart."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field

from ..security.guard import Session, require_session
from ..security.session import issue
from ..wire import Wire
from .account_routes import Uid as AccountUid
from .consent_proof import require_fresh_sign_in
from .routes import SessionResponse

parent_session_router = APIRouter(prefix="/account", tags=["accounts"])


class ParentSignIn(Wire):
    firebase_id_token: str = Field(max_length=4096)


async def _parent(session: Annotated[Session, Depends(require_session)]) -> str:
    """The account's uid, for a session made as the parent."""
    if not session.account or not session.parent:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Sign in again as the parent to do this",
                "code": "account_required",
            },
        )
    return session.account


ParentUid = Annotated[str, Depends(_parent)]


@parent_session_router.post("/parent-session", response_model=SessionResponse)
async def start_parent_session(
    request: Request, uid: AccountUid, body: ParentSignIn
) -> SessionResponse:
    """For the parent who signed in with Google in the last 5 minutes, as this session's
    account."""
    await require_fresh_sign_in(request, uid, body.firebase_id_token)
    issued = issue(request.app.state.session_secret, account=uid, parent=True)
    return SessionResponse(
        token=issued.token, expires_in=issued.expires_in, signed_in=True
    )
