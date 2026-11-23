"""Who may do what only the parent may: the parent's session, in force, and for the one thing a PIN
does not stand for (deleting the account) a Google sign-in just now."""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import Depends, Request

from ..account.consents import GATE_GOOGLE
from ..security.guard import Session, require_session
from .consent_proof import parent_gate, parent_required, refusal

# A Google proof for deleting the account must be this recent by the real credential time, the ID
# token's `auth_time` that the parent's session keeps, not by when the session was made.
GOOGLE_PROOF_SECONDS = 5 * 60


async def _parent(
    request: Request, session: Annotated[Session, Depends(require_session)]
) -> str:
    """The account's uid, for a session made as the parent and still in force."""
    if await parent_gate(request, session) is None:
        raise parent_required()
    assert session.account
    return session.account


ParentUid = Annotated[str, Depends(_parent)]


async def _google_parent(
    request: Request, session: Annotated[Session, Depends(require_session)]
) -> str:
    """The account's uid, for a parent's session made from a Google sign-in in the last five
    minutes: not the PIN's, and not a Google one that has been sitting for ten."""
    gate = await parent_gate(request, session)
    if gate is None:
        raise parent_required()
    proved = session.auth_time
    if (
        gate != GATE_GOOGLE
        or proved is None
        or time.time() - proved > GOOGLE_PROOF_SECONDS
    ):
        raise refusal(
            403, "google_sign_in_required", "Sign in with Google again to do this"
        )
    assert session.account
    return session.account


GoogleParentUid = Annotated[str, Depends(_google_parent)]
