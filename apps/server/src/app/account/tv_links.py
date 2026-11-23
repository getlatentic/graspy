"""A TV's request to be signed in, kept in D1 (docs/TV_SIGN_IN.md).

The TV holds the device code and polls with it; the person holds the short code, reads it off the
TV's screen and gives it to a signed-in phone. The phone approves or denies the request, and only the
device code's holder can then take the session, once. Every state change is one guarded UPDATE, so
two phones or two polls at once cannot both win."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .tv_codes import (
    hash_secret,
    hash_user_code,
    new_device_code,
    new_user_code,
    same,
)

logger = logging.getLogger(__name__)

LINK_TTL_MS = 10 * 60 * 1000
FIRST_INTERVAL_S = 5
SLOW_DOWN_STEP_S = 5
MAX_INTERVAL_S = 30
# A poll this much early is still on time: networks jitter.
EARLY_POLL_TOLERANCE_MS = 1000
# Lookups, approvals and denials of one short code; the last one ends the request.
MAX_ATTEMPTS = 10
# Open requests all together, so nobody can fill the table by asking for codes.
MAX_OPEN_LINKS = 5000
START_TRIES = 3
# Requests are kept this long after they expire, so a TV that asks late is told so.
KEEP_AFTER_EXPIRY_MS = 60 * 60 * 1000

PENDING = "pending"
SLOW_DOWN = "slow_down"
EXPIRED = "expired"
DENIED = "denied"
APPROVED = "approved"

INSERT_SQL = (
    "INSERT INTO tv_links (device_code_hash, user_code_hash, label, country, interval_s, "
    "created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
)
OPEN_COUNT_SQL = "SELECT COUNT(*) AS n FROM tv_links WHERE expires_at > ?1"
POLL_SQL = (
    "SELECT device_code_hash, status, expires_at, interval_s, last_polled_at "
    "FROM tv_links WHERE device_code_hash = ?1"
)
POLLED_SQL = "UPDATE tv_links SET last_polled_at = ?2, interval_s = ?3 WHERE device_code_hash = ?1"
# The tenth attempt ends the request, and is told it did.
TOUCH_SQL = (
    "UPDATE tv_links SET attempts = attempts + 1, "
    "status = CASE WHEN attempts + 1 >= ?3 THEN 'denied' ELSE status END "
    "WHERE user_code_hash = ?1 AND status = 'pending' AND expires_at > ?2 "
    "RETURNING id, status, label, country, created_at, expires_at"
)
APPROVE_SQL = (
    "UPDATE tv_links SET status = 'approved', account_uid = ?2, learner_id = ?3, approved_at = ?4 "
    "WHERE id = ?1 AND status = 'pending' AND expires_at > ?4"
)
DENY_SQL = (
    "UPDATE tv_links SET status = 'denied' "
    "WHERE id = ?1 AND status = 'pending' AND expires_at > ?2"
)
PURGE_SQL = "DELETE FROM tv_links WHERE expires_at < ?1"


class TooManyOpenLinks(Exception):
    pass


@dataclass(frozen=True)
class Started:
    device_code: str
    user_code: str
    expires_in: int
    interval: int


@dataclass(frozen=True)
class Polled:
    status: str
    interval: int | None = None


def row_of(row: Any) -> dict | None:
    if row is None:
        return None
    return row.to_py() if hasattr(row, "to_py") else dict(row)


def rows_of(found: Any) -> list[dict]:
    return [row_of(row) for row in found["results"]]


def changed(result: Any) -> bool:
    """A guarded UPDATE took effect only when D1 reports a changed row."""
    return int(result.meta.changes) > 0


async def start(
    database: Any, secret: str, label: str, country: str | None, now: int
) -> Started:
    """A new request. Raises TooManyOpenLinks at the cap."""
    counted = row_of(await database.prepare(OPEN_COUNT_SQL).bind(now).first())
    if counted and counted["n"] >= MAX_OPEN_LINKS:
        raise TooManyOpenLinks
    for attempt in range(START_TRIES):
        device_code, user_code = new_device_code(), new_user_code()
        try:
            await (
                database.prepare(INSERT_SQL)
                .bind(
                    hash_secret(device_code),
                    hash_user_code(user_code, secret),
                    label,
                    country,
                    FIRST_INTERVAL_S,
                    now,
                    now + LINK_TTL_MS,
                )
                .run()
            )
        except Exception:
            # Two open requests drew the same short code, which has 40 bits: draw again.
            logger.warning("A TV sign-in request was not kept, try %d", attempt + 1)
            if attempt + 1 == START_TRIES:
                raise
            continue
        return Started(device_code, user_code, LINK_TTL_MS // 1000, FIRST_INTERVAL_S)
    raise AssertionError("unreachable")


async def poll(database: Any, device_code: str, now: int) -> Polled:
    """What the TV is told. An unknown code, an expired one and one whose session was taken all
    read as `expired`, so a code cannot be probed."""
    code_hash = hash_secret(device_code)
    row = row_of(await database.prepare(POLL_SQL).bind(code_hash).first())
    if row is None or not same(row["device_code_hash"], code_hash):
        return Polled(EXPIRED)
    if row["expires_at"] <= now or row["status"] == "consumed":
        return Polled(EXPIRED)
    if row["status"] == "denied":
        return Polled(DENIED)
    interval = row["interval_s"]
    last = row["last_polled_at"]
    early = last is not None and now - last < interval * 1000 - EARLY_POLL_TOLERANCE_MS
    if early:
        interval = min(interval + SLOW_DOWN_STEP_S, MAX_INTERVAL_S)
    await database.prepare(POLLED_SQL).bind(code_hash, now, interval).run()
    if early:
        return Polled(SLOW_DOWN, interval)
    return Polled(row["status"], interval)


async def touch(database: Any, secret: str, user_code: str, now: int) -> dict | None:
    """The open request a short code names, with one attempt counted against it, or None when
    there is none, it has expired or this attempt ended it."""
    found = rows_of(
        await database.prepare(TOUCH_SQL)
        .bind(hash_user_code(user_code, secret), now, MAX_ATTEMPTS)
        .all()
    )
    if not found or found[0]["status"] != PENDING:
        return None
    return found[0]


async def approve(
    database: Any, link_id: int, uid: str, learner_id: str, now: int
) -> bool:
    result = (
        await database.prepare(APPROVE_SQL).bind(link_id, uid, learner_id, now).run()
    )
    return changed(result)


async def deny(database: Any, link_id: int, now: int) -> bool:
    return changed(await database.prepare(DENY_SQL).bind(link_id, now).run())


async def purge(database: Any, now: int) -> None:
    await database.prepare(PURGE_SQL).bind(now - KEEP_AFTER_EXPIRY_MS).run()
