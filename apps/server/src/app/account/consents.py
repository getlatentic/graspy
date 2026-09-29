"""A parent's consent for one learner, kept in D1 beside the learner's voice data.

There are two scopes. `service` is consent to use graspy at all; `recordings` is consent to keep the
learner's voice recordings for `retention_days` of the days below, without which a recording is
deleted as soon as its turn ends. A consent names the version of the notice the parent was shown. The
newest grant of a scope is the active one: granting again revokes the row it replaces."""

from __future__ import annotations

from typing import Any

SERVICE = "service"
RECORDINGS = "recordings"
# The notices a parent may be shown before agreeing; their texts are in docs/API.md.
NOTICE_VERSIONS = {SERVICE: frozenset({1}), RECORDINGS: frozenset({1})}
RETENTION_DAYS = (30, 90, 365)
DAY_MS = 24 * 60 * 60 * 1000

ACTIVE_SQL = (
    "SELECT notice_version, retention_days, granted_at FROM consents "
    "WHERE learner_key = ?1 AND scope = ?2 AND revoked_at IS NULL"
)
ACTIVE_OF_ACCOUNT_SQL = (
    "SELECT learner_key, scope, notice_version, retention_days, granted_at "
    "FROM consents WHERE account_uid = ?1 AND revoked_at IS NULL"
)
FORGET_SQL = "DELETE FROM consents WHERE learner_key = ?1"
REVOKE_SQL = (
    "UPDATE consents SET revoked_at = ?3 "
    "WHERE learner_key = ?1 AND scope = ?2 AND revoked_at IS NULL"
)
GRANT_SQL = (
    "INSERT INTO consents (learner_key, account_uid, scope, notice_version, "
    "retention_days, granted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
)


async def active_consent(database: Any, learner_key: str, scope: str) -> dict | None:
    return await database.prepare(ACTIVE_SQL).bind(learner_key, scope).first()


async def consents_of_account(database: Any, uid: str) -> dict[tuple[str, str], dict]:
    """The active consents of the account's learners, by learner key and scope."""
    found = await database.prepare(ACTIVE_OF_ACCOUNT_SQL).bind(uid).all()
    rows = [row.to_py() if hasattr(row, "to_py") else row for row in found["results"]]
    return {(row["learner_key"], row["scope"]): row for row in rows}


async def grant_consent(
    database: Any,
    learner_key: str,
    uid: str,
    scope: str,
    notice_version: int,
    retention_days: int | None,
    now_ms: int,
) -> dict:
    """One batch, so no reader sees the learner with two consents of a scope or none."""
    await database.batch(
        [
            database.prepare(REVOKE_SQL).bind(learner_key, scope, now_ms),
            database.prepare(GRANT_SQL).bind(
                learner_key, uid, scope, notice_version, retention_days, now_ms
            ),
        ]
    )
    return {
        "notice_version": notice_version,
        "retention_days": retention_days,
        "granted_at": now_ms,
    }


async def forget_consents(database: Any, learner_key: str) -> None:
    """Every consent row of a learner who is gone."""
    await database.prepare(FORGET_SQL).bind(learner_key).run()


async def revoke_consent(
    database: Any, learner_key: str, scope: str, now_ms: int
) -> None:
    await database.prepare(REVOKE_SQL).bind(learner_key, scope, now_ms).run()
