"""The TVs an account has signed in, kept in D1 (docs/TV_SIGN_IN.md).

A signed session token cannot be taken back, so a TV holds two things: a session token that lasts
an hour, and a refresh credential that makes the next one. The credential is a row here, kept as a
hash, which the account can list and revoke; revoking stops the TV renewing, and its last token
ends within the hour. A credential ends after 90 days, or after 30 days without use."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any

from ..learner.time import now_ms
from . import tv_links
from .tv_codes import hash_secret, new_refresh_token, same
from .tv_links import changed, row_of, rows_of

DAY_MS = 24 * 60 * 60 * 1000
CREDENTIAL_TTL_MS = 90 * DAY_MS
IDLE_LIMIT_MS = 30 * DAY_MS
# A TV signed in beyond this must be removed first, so the list stays readable.
MAX_TVS_PER_ACCOUNT = 10
# Revoked and expired rows are kept this long, then purged.
KEEP_AFTER_END_MS = DAY_MS

TAKE_SQL = (
    "INSERT INTO tv_sessions (id, refresh_hash, account_uid, learner_id, label, created_at, "
    "last_used_at, expires_at) SELECT ?1, ?2, account_uid, learner_id, label, ?3, ?3, ?4 "
    "FROM tv_links WHERE device_code_hash = ?5 AND status = 'approved' AND expires_at > ?3"
)
CONSUME_SQL = (
    "UPDATE tv_links SET status = 'consumed' "
    "WHERE device_code_hash = ?1 AND status = 'approved' AND expires_at > ?2"
)
TAKEN_SQL = "SELECT account_uid, learner_id, label FROM tv_sessions WHERE id = ?1"
RENEW_SQL = (
    "UPDATE tv_sessions SET last_used_at = ?2 WHERE refresh_hash = ?1 AND revoked_at IS NULL "
    "AND expires_at > ?2 AND last_used_at > ?3 "
    "RETURNING id, refresh_hash, account_uid, learner_id"
)
ACTIVE_SQL = (
    "SELECT id, label, learner_id, created_at, last_used_at FROM tv_sessions "
    "WHERE account_uid = ?1 AND revoked_at IS NULL AND expires_at > ?2 "
    "AND last_used_at > ?3 ORDER BY created_at DESC"
)
COUNT_SQL = (
    "SELECT COUNT(*) AS n FROM tv_sessions WHERE account_uid = ?1 AND revoked_at IS NULL "
    "AND expires_at > ?2 AND last_used_at > ?3"
)
REVOKE_SQL = (
    "UPDATE tv_sessions SET revoked_at = ?3 "
    "WHERE id = ?1 AND account_uid = ?2 AND revoked_at IS NULL"
)
REVOKE_OWN_SQL = "UPDATE tv_sessions SET revoked_at = ?2 WHERE refresh_hash = ?1 AND revoked_at IS NULL"
FORGET_ACCOUNT_SQL = "DELETE FROM tv_sessions WHERE account_uid = ?1"
FORGET_LINKS_SQL = "DELETE FROM tv_links WHERE account_uid = ?1"
PURGE_SQL = "DELETE FROM tv_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?1) OR expires_at < ?1"


@dataclass(frozen=True)
class Taken:
    id: str
    refresh_token: str
    account_uid: str
    learner_id: str
    label: str


@dataclass(frozen=True)
class Renewed:
    id: str
    account_uid: str
    learner_id: str


async def take(database: Any, device_code: str, now: int) -> Taken | None:
    """The approved request's session, made once: the request is consumed in the same
    transaction that makes the session, so a second poll, or a replay of the device code, finds
    nothing to take."""
    code_hash = hash_secret(device_code)
    session_id, refresh_token = secrets.token_urlsafe(9), new_refresh_token()
    await database.batch(
        [
            database.prepare(TAKE_SQL).bind(
                session_id,
                hash_secret(refresh_token),
                now,
                now + CREDENTIAL_TTL_MS,
                code_hash,
            ),
            database.prepare(CONSUME_SQL).bind(code_hash, now),
        ]
    )
    row = row_of(await database.prepare(TAKEN_SQL).bind(session_id).first())
    if row is None:
        return None
    return Taken(
        session_id, refresh_token, row["account_uid"], row["learner_id"], row["label"]
    )


async def renew(database: Any, refresh_token: str, now: int) -> Renewed | None:
    """The TV renews its session: the credential is live, unrevoked and used within 30 days."""
    presented = hash_secret(refresh_token)
    found = rows_of(
        await database.prepare(RENEW_SQL)
        .bind(presented, now, now - IDLE_LIMIT_MS)
        .all()
    )
    if not found or not same(found[0]["refresh_hash"], presented):
        return None
    return Renewed(found[0]["id"], found[0]["account_uid"], found[0]["learner_id"])


async def active(database: Any, uid: str, now: int) -> list[dict]:
    return rows_of(
        await database.prepare(ACTIVE_SQL).bind(uid, now, now - IDLE_LIMIT_MS).all()
    )


async def active_count(database: Any, uid: str, now: int) -> int:
    row = row_of(
        await database.prepare(COUNT_SQL).bind(uid, now, now - IDLE_LIMIT_MS).first()
    )
    return int(row["n"]) if row else 0


async def revoke(database: Any, uid: str, session_id: str, now: int) -> bool:
    """Only the account's own: another account's id changes nothing."""
    return changed(await database.prepare(REVOKE_SQL).bind(session_id, uid, now).run())


async def revoke_own(database: Any, refresh_token: str, now: int) -> None:
    """The TV signing itself out."""
    await database.prepare(REVOKE_OWN_SQL).bind(hash_secret(refresh_token), now).run()


async def forget_account(database: Any, uid: str) -> None:
    """With the account: its TVs and the requests it approved."""
    await database.batch(
        [
            database.prepare(FORGET_ACCOUNT_SQL).bind(uid),
            database.prepare(FORGET_LINKS_SQL).bind(uid),
        ]
    )


async def purge(database: Any, now: int) -> None:
    await database.prepare(PURGE_SQL).bind(now - KEEP_AFTER_END_MS).run()


async def purge_tv_sign_in(env: Any, now: int | None = None) -> None:
    """The cron trigger's part: requests and credentials past their time are deleted."""
    when = now_ms() if now is None else now
    await tv_links.purge(env.DB, when)
    await purge(env.DB, when)
