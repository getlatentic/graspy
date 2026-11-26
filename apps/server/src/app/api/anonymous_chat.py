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
import ipaddress
import logging
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

HOUR_MS = 60 * 60 * 1000
DAY_MS = 24 * HOUR_MS
# A slow store must not hold the turn it is counting.
COUNT_TIMEOUT_SECONDS = 3

COUNTS_SQL = "SELECT bucket, turns FROM anonymous_chat_use WHERE bucket IN ({marks})"
PRUNE_SQL = "DELETE FROM anonymous_chat_use WHERE expires_at <= ?1"
ADD_SQL = (
    "INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES (?1, 1, ?2) "
    "ON CONFLICT (bucket) DO UPDATE SET turns = turns + 1"
)


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


def _rows(result: Any) -> list[dict]:
    result = result.to_py() if hasattr(result, "to_py") else result
    return [dict(row) for row in result["results"]]


async def _count(database: Any, found: list[Counter], now: int) -> bool:
    """Adds the turn to every count, or to none when any is at its limit: a turn refused by a wide
    count does not spend a narrow one. The counts are read in one batch and added to in another, so
    turns that race may pass a limit by a few."""
    marks = ", ".join(f"?{n + 1}" for n in range(len(found)))
    read = database.prepare(COUNTS_SQL.format(marks=marks)).bind(
        *(counter.bucket for counter in found)
    )
    results = await database.batch([database.prepare(PRUNE_SQL).bind(now), read])
    held = {row["bucket"]: row["turns"] for row in _rows(results[1])}
    if any(held.get(counter.bucket, 0) >= counter.limit for counter in found):
        return False
    await database.batch(
        [
            database.prepare(ADD_SQL).bind(counter.bucket, counter.expires_at)
            for counter in found
        ]
    )
    return True


async def anonymous_turn_refusal(
    database: Any, session: Session, address: str | None
) -> HTTPException | None:
    """None for a signed-in account's session, which these limits are not for, and for an
    anonymous one still within them (the turn is then counted); else the refusal to send. A count
    that cannot be made refuses: an open chat that cannot be counted is an open bill."""
    if session.account:
        return None
    now = now_ms()
    try:
        async with asyncio.timeout(COUNT_TIMEOUT_SECONDS):
            within = await _count(
                database, counters(session, edge_network(address), now), now
            )
    except Exception:
        logger.exception("The anonymous chat's turns could not be counted")
        return _refusal(503, TRY_UNAVAILABLE, "Try again in a moment")
    if within:
        return None
    return _refusal(429, TRY_LIMIT, "Try again later, or sign in to keep going")
