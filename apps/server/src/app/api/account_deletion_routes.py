"""Deleting the account. It needs the parent's session made from a Google sign-in just now, not the
one made from the parent PIN: this is the one thing a PIN does not stand for (docs/PARENT_PIN.md)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from ..account.learners import closed
from ..account.parent_pins import forget as forget_pin
from ..account.tv_sessions import forget_account as forget_tvs
from ..security.firebase_admin import RemovalFailed
from .account_parent_routes import GoogleParentUid
from .account_routes import KeepingDep
from .consent_proof import refusal

logger = logging.getLogger(__name__)

account_deletion_router = APIRouter(prefix="/account", tags=["account"])


@account_deletion_router.delete("", status_code=204)
async def delete_account(
    request: Request, uid: GoogleParentUid, keeping: KeepingDep
) -> None:
    """Every learner and everything kept for them, then graspy's Firebase record of the
    account (its email and name); the Google account itself is Google's. What is kept goes
    first: a Firebase failure leaves nothing but that record, and asking again removes it,
    where the other order could leave the data with no one able to sign in to ask."""
    await closed(keeping, uid)
    await forget_tvs(request.app.state.tv_db, uid)
    await forget_pin(request.app.state.tv_db, uid)
    admin = request.app.state.firebase_admin
    if admin is None:
        return
    try:
        await admin.remove_user(uid)
    except RemovalFailed as failed:
        logger.error("The Firebase user of an account was not removed: %s", failed)
        raise refusal(
            503,
            "account_record_not_removed",
            "Everything kept for the learners is deleted, but the sign-in record is not yet. "
            "Try again.",
        ) from failed
