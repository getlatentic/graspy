"""Limits on the tutor chat for a visitor with no account (the web's /try). It is the one way to
spend model credits without signing in, so each turn is counted: per session, per network by the
hour and by the day, and for all such visitors by the day. Past a limit the chat answers
`429 try_limit`, which the page words as "Try again later, or sign in to keep going".

The counts are in D1 (migration 0027): the Workers rate-limit binding counts a minute at most, and
the existing per-minute budget (`AGENT_LIMITER`) already stands in front of the turn. A session is
cheap to mint, so its limit is soft: it stops a page that loops, and the network and day limits are
the ones that hold. A network's limits are those of a school or a home sharing an address, not of
one child. The network is the address Cloudflare's edge puts in `CF-Connecting-IP`, and nothing a
client can set: without it a turn is counted for its session and in all only, so one visitor with no
address is never taken for all of them."""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from ..learner.time import now_ms
from ..security.guard import Session
from ..security.rate_limit import source_of
from ..security.session import TOKEN_TTL_SECONDS

logger = logging.getLogger(__name__)

TRY_LIMIT = "try_limit"
TRY_UNAVAILABLE = "try_unavailable"

SESSION_TURNS = 30
NETWORK_TURNS_PER_HOUR = 60
NETWORK_TURNS_PER_DAY = 200
TURNS_PER_DAY = 3000

EDGE_ADDRESS_HEADER = "cf-connecting-ip"
HOUR_MS = 60 * 60 * 1000
DAY_MS = 24 * HOUR_MS
# A slow store must not hold the turn it is counting.
COUNT_TIMEOUT_SECONDS = 3

PRUNE_SQL = "DELETE FROM anonymous_chat_use WHERE expires_at <= ?1"
# One conditional statement per count: it adds the turn only while the count is under its limit, and
# says by the rows it changed whether it did, so the check and the add cannot be split by another turn.
SPEND_SQL = (
    "INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES (?1, 1, ?2) "
    "ON CONFLICT (bucket) DO UPDATE SET turns = turns + 1 WHERE turns < ?3"
)
GIVE_BACK_SQL = (
    "UPDATE anonymous_chat_use SET turns = turns - 1 WHERE bucket = ?1 AND turns > 0"
)
FORGET_EMPTY_SQL = "DELETE FROM anonymous_chat_use WHERE bucket = ?1 AND turns <= 0"
# A turn that has been counted leaves a row of this kind, so it is never counted twice.
COUNTED_SQL = "SELECT 1 AS counted FROM anonymous_chat_use WHERE bucket = ?1"
MARK_SQL = "INSERT OR IGNORE INTO anonymous_chat_use (bucket, turns, expires_at) VALUES (?1, 1, ?2)"


@dataclass(frozen=True)
class Counter:
    bucket: str
    limit: int
    expires_at: int


def edge_network(address: str | None) -> str | None:
    """The network of the address the edge reported (an IPv4 address, an IPv6 /64), or None when
    there is none or it is not an address."""
    if not address:
        return None
    try:
        ipaddress.ip_address(address)
    except ValueError:
        return None
    return source_of(address)


def counters(session: Session, network: str | None, now: int) -> list[Counter]:
    """The counts one turn adds to."""
    hour, day = now // HOUR_MS, now // DAY_MS
    found = []
    if session.jti:
        found.append(
            Counter(
                f"session:{session.jti}", SESSION_TURNS, now + TOKEN_TTL_SECONDS * 1000
            )
        )
    if network:
        found += [
            Counter(
                f"network-hour:{network}:{hour}",
                NETWORK_TURNS_PER_HOUR,
                (hour + 1) * HOUR_MS,
            ),
            Counter(
                f"network-day:{network}:{day}",
                NETWORK_TURNS_PER_DAY,
                (day + 1) * DAY_MS,
            ),
        ]
    found.append(Counter(f"all-day:{day}", TURNS_PER_DAY, (day + 1) * DAY_MS))
    return found


def _refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


def _plain(result: Any) -> Any:
    return result.to_py() if hasattr(result, "to_py") else result


def _rows(result: Any) -> list[dict]:
    return [dict(row) for row in _plain(result)["results"]]


def _changed(result: Any) -> int:
    return int(_plain(result)["meta"]["changes"])


def _turn_bucket(chat: str, turn: str) -> str:
    """Hashed, since an A2A client chooses the lengths of both ids."""
    return "turn:" + hashlib.sha256(f"{chat}\0{turn}".encode()).hexdigest()


async def _is_counted(database: Any, bucket: str, now: int) -> bool:
    found = await database.batch(
        [
            database.prepare(PRUNE_SQL).bind(now),
            database.prepare(COUNTED_SQL).bind(bucket),
        ]
    )
    return bool(_rows(found[1]))


async def _spend(database: Any, found: list[Counter]) -> list[Counter]:
    """Adds the turn to every count still under its limit, in one transaction, and returns the
    counts it was added to."""
    results = await database.batch(
        [
            database.prepare(SPEND_SQL).bind(c.bucket, c.expires_at, c.limit)
            for c in found
        ]
    )
    return [
        counter
        for counter, result in zip(found, results, strict=True)
        if _changed(result)
    ]


async def _give_back(database: Any, spent: list[Counter]) -> None:
    statements = []
    for counter in spent:
        statements.append(database.prepare(GIVE_BACK_SQL).bind(counter.bucket))
        statements.append(database.prepare(FORGET_EMPTY_SQL).bind(counter.bucket))
    if statements:
        await database.batch(statements)


async def _count(
    database: Any, found: list[Counter], chat: str, turn: str, now: int
) -> bool:
    """Adds the turn to every count, or to none when any is at its limit. Each count is added to
    by one statement that checks its own limit, so turns that race cannot pass a limit together. A
    turn refused by one count gives back what it added to the others, which another turn may see
    for a moment as spent: a limit is then reached a turn early, never passed. A turn already
    counted (a start sent again, or a second start of it racing the first) is admitted without
    being counted again.

    What stays racy: a turn that is cut off (the timeout, a restart) between adding and giving
    back leaves its counts spent, and a refused turn's retry then finds them so."""
    bucket = _turn_bucket(chat, turn)
    if await _is_counted(database, bucket, now):
        return True
    spent = await _spend(database, found)
    if len(spent) < len(found):
        await _give_back(database, spent)
        return False
    marked = await database.batch(
        [database.prepare(MARK_SQL).bind(bucket, now + DAY_MS)]
    )
    if not _changed(marked[0]):
        # A start of this turn that raced this one counted it first.
        await _give_back(database, spent)
    return True


def edge_address(headers: Mapping[str, str]) -> str | None:
    """The address Cloudflare's edge reported, whatever the case the headers came in."""
    for name, value in headers.items():
        if name.lower() == EDGE_ADDRESS_HEADER:
            return value
    return None


async def anonymous_turn_refusal(
    database: Any, session: Session | None, address: str | None, chat: str, turn: str
) -> HTTPException | None:
    """None for a signed-in account's session, which these limits are not for, and for an
    anonymous one still within them (the turn is then counted, once per chat and turn); else the
    refusal to send. A count that cannot be made refuses: an open chat that cannot be counted is
    an open bill, and so is a call with no session to count it for."""
    if session is None:
        return _refusal(401, "session_required", "A session is required")
    if session.account:
        return None
    now = now_ms()
    try:
        async with asyncio.timeout(COUNT_TIMEOUT_SECONDS):
            within = await _count(
                database, counters(session, edge_network(address), now), chat, turn, now
            )
    except Exception:
        logger.exception("The anonymous chat's turns could not be counted")
        return _refusal(503, TRY_UNAVAILABLE, "Try again in a moment")
    if within:
        return None
    return _refusal(429, TRY_LIMIT, "Try again later, or sign in to keep going")
