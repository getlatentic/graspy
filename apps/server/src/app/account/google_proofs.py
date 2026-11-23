"""A Google sign-in proves who the parent is once (docs/PARENT_PIN.md).

An ID token stays readable on the device it was made on, and is good for five minutes, so a token
that is only checked for being fresh can be sent again and again by whoever can read it. Here the
newest sign-in an account has been taken to prove itself by (its `auth_time`) is kept, and a proof
is accepted only if it is later: one statement, so two requests with the same token at once are
not both accepted."""

from __future__ import annotations

from typing import Any

ACCEPT_SQL = (
    "INSERT INTO google_proofs (account_uid, auth_time) VALUES (?1, CAST(?2 AS INTEGER)) "
    "ON CONFLICT (account_uid) DO UPDATE SET auth_time = excluded.auth_time "
    "WHERE google_proofs.auth_time < excluded.auth_time"
)
FORGET_SQL = "DELETE FROM google_proofs WHERE account_uid = ?1"


async def accept(database: Any, uid: str, auth_time: int) -> bool:
    """False when this sign-in, or a later one, has proved already."""
    result = await database.prepare(ACCEPT_SQL).bind(uid, auth_time).run()
    return int(result.meta.changes) > 0


async def forget(database: Any, uid: str) -> None:
    await database.prepare(FORGET_SQL).bind(uid).run()
