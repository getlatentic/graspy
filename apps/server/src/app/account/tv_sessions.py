"""The TVs an account has signed in, kept in D1 (docs/TV_SIGN_IN.md).

A signed session token cannot be taken back, so a TV holds two things: a session token that lasts
an hour, and a refresh credential that makes the next one. The credential is a row here, kept as a
hash, which the account can list and revoke; revoking stops the TV renewing, and its last token
ends within the hour. A credential ends after 90 days, or after 30 days without use.

The credential changes at every renewal, to a successor that follows from the one it replaces
(tv_codes.successor_of). A TV whose answer was lost presents the replaced one again, within a
minute and at most twice, and is given the same successor; two tabs renewing at once end with one.
The replaced credential presented after that, or the one before it, is a copy somewhere it should
not be, and the whole TV is revoked."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any

from ..learner.time import now_ms
from ..security.session import TV_TOKEN_TTL_SECONDS
from . import tv_links
from .tv_codes import hash_secret, new_refresh_token, successor_of
from .tv_links import changed, row_of, rows_of

DAY_MS = 24 * 60 * 60 * 1000
CREDENTIAL_TTL_MS = 90 * DAY_MS
IDLE_LIMIT_MS = 30 * DAY_MS
# A TV signed in beyond this must be removed first, so the list stays readable.
MAX_TVS_PER_ACCOUNT = 10
# Revoked and expired rows are kept this long, then purged.
KEEP_AFTER_END_MS = DAY_MS
# The credential a renewal replaced is answered again within this long, this many times.
GRACE_MS = 60 * 1000
GRACE_REDELIVERIES = 2
# A TV that took its session and never renewed it, a week after that session ended, has most
# likely lost the answer that held the credential; it is revoked, so it does not linger toward
# the limit of TVs. A TV linked on Saturday and opened on Monday is not that.
UNRENEWED_MS = 7 * DAY_MS + TV_TOKEN_TTL_SECONDS * 1000

TAKE_SQL = (
    "INSERT INTO tv_sessions (id, refresh_hash, account_uid, learner_id, label, created_at, "
    "last_used_at, expires_at) SELECT ?1, ?2, account_uid, learner_id, label, ?3, ?3, ?4 "
    "FROM tv_links WHERE device_code_hash = ?5 AND status = 'approved' AND expires_at > ?3 "
    "AND (SELECT COUNT(*) FROM tv_sessions WHERE account_uid = tv_links.account_uid "
    "AND revoked_at IS NULL AND expires_at > ?3 AND last_used_at > ?6) < ?7"
)
CONSUME_SQL = (
    "UPDATE tv_links SET status = 'consumed' "
    "WHERE device_code_hash = ?1 AND status = 'approved' AND expires_at > ?2"
)
TAKEN_SQL = "SELECT account_uid, learner_id, label FROM tv_sessions WHERE id = ?1"
PEEK_SQL = (
    "SELECT id, account_uid, learner_id FROM tv_sessions "
    "WHERE (refresh_hash = ?1 OR prev_hash = ?1) AND revoked_at IS NULL AND expires_at > ?2"
)
ROTATE_SQL = (
    "UPDATE tv_sessions SET prev2_hash = prev_hash, prev_hash = refresh_hash, refresh_hash = ?4, "
    "rotated_at = ?2, grace_used = 0, last_used_at = ?2, "
    "renewed_at = COALESCE(renewed_at, ?2) "
    "WHERE refresh_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2 AND last_used_at > ?3 "
    "RETURNING id, account_uid, learner_id"
)
# The successor was given already: the same one is answered again, a limited number of times.
REDELIVER_SQL = (
    "UPDATE tv_sessions SET grace_used = grace_used + 1, last_used_at = ?2 "
    "WHERE prev_hash = ?1 AND refresh_hash = ?4 AND grace_used < ?5 AND rotated_at >= ?6 "
    "AND revoked_at IS NULL AND expires_at > ?2 AND last_used_at > ?3 "
    "RETURNING id, account_uid, learner_id"
)
# A credential that was replaced and is presented outside its grace, or the one before, is a copy.
REUSE_SQL = (
    "UPDATE tv_sessions SET revoked_at = ?2 "
    "WHERE (prev_hash = ?1 OR prev2_hash = ?1) AND revoked_at IS NULL"
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
UNRENEWED_SQL = (
    "UPDATE tv_sessions SET revoked_at = ?1 "
    "WHERE renewed_at IS NULL AND revoked_at IS NULL AND created_at < ?2"
)
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
    # The credential the TV holds from now on.
    refresh_token: str


async def take(database: Any, device_code: str, now: int) -> Taken | None:
    """The approved request's session, made once: the request is consumed in the same
    transaction that makes the session, so a second poll, or a replay of the device code, finds
    nothing to take. Nothing is taken for an account that already holds the most TVs."""
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
                now - IDLE_LIMIT_MS,
                MAX_TVS_PER_ACCOUNT,
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


async def peek(database: Any, refresh_token: str, now: int) -> dict | None:
    """Whose credential this is, without changing anything: for the checks that must come before
    a renewal, since a renewal that fails afterwards would leave the TV without its new credential."""
    return row_of(
        await database.prepare(PEEK_SQL).bind(hash_secret(refresh_token), now).first()
    )


async def renew(
    database: Any, secret: str, refresh_token: str, now: int
) -> Renewed | None:
    """The TV renews its session: the credential is live, unrevoked and used within 30 days. It is
    replaced by its successor, which is returned. A credential already replaced is answered with
    the same successor, up to twice within the grace; any other use of it, or of the one before,
    revokes the TV."""
    presented = hash_secret(refresh_token)
    successor = successor_of(refresh_token, secret)
    idle_before = now - IDLE_LIMIT_MS
    attempts = (
        (ROTATE_SQL, (hash_secret(successor),)),
        (REDELIVER_SQL, (hash_secret(successor), GRACE_REDELIVERIES, now - GRACE_MS)),
    )
    for sql, extra in attempts:
        found = rows_of(
            await database.prepare(sql).bind(presented, now, idle_before, *extra).all()
        )
        if found:
            return Renewed(
                found[0]["id"],
                found[0]["account_uid"],
                found[0]["learner_id"],
                successor,
            )
    await database.prepare(REUSE_SQL).bind(presented, now).run()
    return None


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
    """The cron trigger's part: requests and credentials past their time are deleted, and a TV
    that never renewed what it took is revoked."""
    when = now_ms() if now is None else now
    await tv_links.purge(env.DB, when)
    await env.DB.prepare(UNRENEWED_SQL).bind(when, when - UNRENEWED_MS).run()
    await purge(env.DB, when)
