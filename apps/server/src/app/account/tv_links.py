"""A TV's request to be signed in, kept in D1 (docs/TV_SIGN_IN.md).

The TV holds the device code and polls with it; the person holds the short code, reads it off the
TV's screen and gives it to a parent's phone. The phone looks the code up, which holds the request
for that account for a few minutes, then approves or denies it, and the TV takes its session once
the person at the TV says to continue. Every state change is one guarded statement, so two phones
or two polls at once cannot both win."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .tv_codes import (
    hash_secret,
    hash_source,
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
# Lookups, approvals, denials and wrong confirmations that found a request, per request. The
# last one ends it. A guess at a code that names no request finds nothing to count: those are
# limited by the pairing budgets and by the 40 bits of the code.
MAX_ATTEMPTS = 10
# A phone that looked a code up holds it this long; no other account can approve it meanwhile.
LOCK_MS = 2 * 60 * 1000
# Open (pending, unexpired) requests all together, and from one source.
MAX_OPEN_LINKS = 5000
MAX_OPEN_PER_SOURCE = 8
START_TRIES = 3
# Requests are kept this long after they expire, so a TV that asks late is told so.
KEEP_AFTER_EXPIRY_MS = 60 * 60 * 1000

PENDING = "pending"
SLOW_DOWN = "slow_down"
EXPIRED = "expired"
DENIED = "denied"
APPROVED = "approved"
# What a poll says of an approved request that the TV has not yet taken: the person at the TV
# is to confirm.
LINKING = "linking"

# One statement: the request is made only while both caps hold, so no count can be passed between
# a check and the insert.
INSERT_SQL = (
    "INSERT INTO tv_links (device_code_hash, user_code_hash, label, country, source_hash, "
    "interval_s, created_at, expires_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 "
    "WHERE (SELECT COUNT(*) FROM tv_links WHERE status = 'pending' AND expires_at > ?7) < ?9 "
    "AND (SELECT COUNT(*) FROM tv_links WHERE status = 'pending' AND expires_at > ?7 "
    "AND source_hash = ?5) < ?10"
)
SOURCE_COUNT_SQL = (
    "SELECT COUNT(*) AS n FROM tv_links "
    "WHERE status = 'pending' AND expires_at > ?1 AND source_hash = ?2"
)
POLL_SQL = (
    "SELECT device_code_hash, status, expires_at, interval_s, last_polled_at, "
    "account_uid, learner_id FROM tv_links WHERE device_code_hash = ?1"
)
POLLED_SQL = "UPDATE tv_links SET last_polled_at = ?2, interval_s = ?3 WHERE device_code_hash = ?1"
# The tenth attempt ends the request, and is told it did. The account that looks first holds the
# request; the same account may look again, any other is turned away while the hold lasts.
LOOK_SQL = (
    "UPDATE tv_links SET attempts = attempts + 1, "
    "status = CASE WHEN attempts + 1 >= ?3 THEN 'denied' ELSE status END, "
    "locked_by = CASE WHEN locked_by IS NULL OR locked_until <= ?2 OR locked_by = ?4 "
    "THEN ?4 ELSE locked_by END, "
    "locked_until = CASE WHEN locked_by IS NULL OR locked_until <= ?2 OR locked_by = ?4 "
    "THEN ?2 + ?5 ELSE locked_until END "
    "WHERE user_code_hash = ?1 AND status = 'pending' AND expires_at > ?2 "
    "RETURNING id, status, label, country, created_at, expires_at, locked_by"
)
# Approving and denying work only for the account holding the request.
HELD_SQL = (
    "UPDATE tv_links SET attempts = attempts + 1, "
    "status = CASE WHEN attempts + 1 >= ?4 THEN 'denied' ELSE status END "
    "WHERE user_code_hash = ?1 AND status = 'pending' AND expires_at > ?2 "
    "AND locked_by = ?3 AND locked_until > ?2 RETURNING id, status"
)
APPROVE_SQL = (
    "UPDATE tv_links SET status = 'approved', account_uid = ?2, learner_id = ?3, approved_at = ?4 "
    "WHERE id = ?1 AND status = 'pending' AND expires_at > ?4 "
    "AND locked_by = ?2 AND locked_until > ?4"
)
DENY_SQL = (
    "UPDATE tv_links SET status = 'denied' "
    "WHERE id = ?1 AND status = 'pending' AND expires_at > ?2 "
    "AND locked_by = ?3 AND locked_until > ?2"
)
# The TV's own cancel, by its device code: a request not yet taken ends.
CANCEL_SQL = (
    "UPDATE tv_links SET status = 'denied' "
    "WHERE device_code_hash = ?1 AND status IN ('pending', 'approved')"
)
PURGE_SQL = "DELETE FROM tv_links WHERE expires_at < ?1"


class TooManyFromSource(Exception):
    """One source holds as many open requests as it may."""


class TooManyOpenLinks(Exception):
    pass


class HeldByAnother(Exception):
    """Another account looked the code up first and holds the request."""


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
    # With `linking`: whom the approved request is for.
    account_uid: str | None = None
    learner_id: str | None = None


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
    database: Any,
    secret: str,
    label: str,
    country: str | None,
    source: str,
    now: int,
) -> Started:
    """A new request. Raises TooManyFromSource, then TooManyOpenLinks, when a cap stops it."""
    source_hash = hash_source(source, secret)
    for attempt in range(START_TRIES):
        device_code, user_code = new_device_code(), new_user_code()
        try:
            result = (
                await database.prepare(INSERT_SQL)
                .bind(
                    hash_secret(device_code),
                    hash_user_code(user_code, secret),
                    label,
                    country,
                    source_hash,
                    FIRST_INTERVAL_S,
                    now,
                    now + LINK_TTL_MS,
                    MAX_OPEN_LINKS,
                    MAX_OPEN_PER_SOURCE,
                )
                .run()
            )
        except Exception:
            # Two open requests drew the same short code, which has 40 bits: draw again.
            logger.warning("A TV sign-in request was not kept, try %d", attempt + 1)
            if attempt + 1 == START_TRIES:
                raise
            continue
        if changed(result):
            return Started(
                device_code, user_code, LINK_TTL_MS // 1000, FIRST_INTERVAL_S
            )
        await _refused(database, source_hash, now)
    raise AssertionError("unreachable")


async def _refused(database: Any, source_hash: str, now: int) -> None:
    """Which cap stopped the insert: the source's own first, so one source is told to slow down
    before everyone is told the service is full."""
    held = row_of(
        await database.prepare(SOURCE_COUNT_SQL).bind(now, source_hash).first()
    )
    if held and int(held["n"]) >= MAX_OPEN_PER_SOURCE:
        raise TooManyFromSource
    raise TooManyOpenLinks


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
    if row["status"] == APPROVED:
        return Polled(LINKING, interval, row["account_uid"], row["learner_id"])
    return Polled(row["status"], interval)


async def approved_for(database: Any, device_code: str, now: int) -> dict | None:
    """Whom the TV's request was approved for, while it can still be taken."""
    row = row_of(
        await database.prepare(POLL_SQL).bind(hash_secret(device_code)).first()
    )
    if row is None or row["status"] != APPROVED or row["expires_at"] <= now:
        return None
    return row


async def look_up(
    database: Any, secret: str, user_code: str, uid: str, now: int
) -> dict | None:
    """The open request a short code names, held for `uid` for a few minutes, with one attempt
    counted against it. None when there is none, it has expired or this attempt ended it.
    Raises HeldByAnother when another account holds it."""
    found = rows_of(
        await database.prepare(LOOK_SQL)
        .bind(hash_user_code(user_code, secret), now, MAX_ATTEMPTS, uid, LOCK_MS)
        .all()
    )
    if not found or found[0]["status"] != PENDING:
        return None
    if found[0]["locked_by"] != uid:
        raise HeldByAnother
    return found[0]


async def held(
    database: Any, secret: str, user_code: str, uid: str, now: int
) -> dict | None:
    """The request `uid` looked up and still holds, with one attempt counted; None otherwise,
    which for approving and denying is all the same as no such code."""
    found = rows_of(
        await database.prepare(HELD_SQL)
        .bind(hash_user_code(user_code, secret), now, uid, MAX_ATTEMPTS)
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


async def deny(database: Any, link_id: int, uid: str, now: int) -> bool:
    return changed(await database.prepare(DENY_SQL).bind(link_id, now, uid).run())


async def cancel(database: Any, device_code: str) -> None:
    """The TV gives up its request, or the person there declines it."""
    await database.prepare(CANCEL_SQL).bind(hash_secret(device_code)).run()


async def purge(database: Any, now: int) -> None:
    await database.prepare(PURGE_SQL).bind(now - KEEP_AFTER_EXPIRY_MS).run()
