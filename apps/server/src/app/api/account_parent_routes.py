"""The parent's own session. What only the parent may do, such as hearing a learner's kept
recordings, needs it: a session that carries the account and no learner, made from the parent PIN
(api/account_pin_routes.py) or from a Google sign-in done just now, and short-lived. A child's
session carries the same account, so the account alone does not tell the two apart."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from ..account.consents import GATE_GOOGLE
from ..account.tv_codes import masked_email
from ..security.guard import Session, require_session
from ..security.session import issue
from ..wire import Wire
from .account_routes import Uid as AccountUid
from .consent_proof import (
    require_fresh_sign_in,
)
from .routes import SessionResponse

parent_session_router = APIRouter(prefix="/account", tags=["accounts"])


class ParentSignIn(Wire):
    firebase_id_token: str = Field(max_length=4096)


def parent_session_response(
    request: Request,
    uid: str,
    gate: str,
    hint: str | None,
    auth_time: int | None = None,
) -> SessionResponse:
    issued = issue(
        request.app.state.session_secret,
        account=uid,
        parent=True,
        gate=gate,
        hint=hint,
        auth_time=auth_time,
    )
    return SessionResponse(
        token=issued.token, expires_in=issued.expires_in, signed_in=True
    )


@parent_session_router.post("/parent-session", response_model=SessionResponse)
async def start_parent_session(
    request: Request,
    uid: AccountUid,
    session: Annotated[Session, Depends(require_session)],
    body: ParentSignIn,
) -> SessionResponse:
    """For the parent who signed in with Google in the last 5 minutes, as this session's
    account. Signing in with Google is how a parent whose account holds no PIN, or who forgot it,
    is the parent; the app asks for the PIN first (api/account_pin_routes.py)."""
    signed = await require_fresh_sign_in(request, uid, body.firebase_id_token, session)
    return parent_session_response(
        request, uid, GATE_GOOGLE, masked_email(signed.email), signed.auth_time
    )
