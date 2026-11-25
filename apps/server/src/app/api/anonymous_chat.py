"""Limits on the tutor chat for a visitor with no account (the web's /try). It is the one way to
spend model credits without signing in, so each turn is counted: per session, per network by the
hour and by the day, and for all such visitors by the day. Past a limit the chat answers
`429 try_limit`, which the page words as "Try again later, or sign in to keep going".

The counts are in D1 (migration 0027): the Workers rate-limit binding counts a minute at most, and
the existing per-minute budget (`AGENT_LIMITER`) already stands in front of the turn. A session is
cheap to mint (`SESSION_LIMITER` bounds that), so the network and day limits are the ones that hold;
the session limit stops one page that loops. A network's limits are those of a school or a home
sharing an address, not of one child."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from ..learner.time import now_ms
from ..security.guard import Session
from ..security.rate_limit import client_key, source_of
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

COUNT_SQL = (
    "INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES (?1, 1, ?2) "
    "ON CONFLICT (bucket) DO UPDATE SET turns = turns + 1 RETURNING turns"
)
PRUNE_SQL = "DELETE FROM anonymous_chat_use WHERE expires_at <= ?1"


@dataclass(frozen=True)
class Counter:
    bucket: str
    limit: int
    expires_at: int


def counters(session: Session, source: str, now: int) -> list[Counter]:
    """The counts one turn adds to, the narrowest first: a turn over a narrow limit is not added to
    the wider counts, so one visitor cannot spend everyone's day."""
    hour, day = now // HOUR_MS, now // DAY_MS
    found = []
    if session.jti:
        found.append(
            Counter(
                f"session:{session.jti}", SESSION_TURNS, now + TOKEN_TTL_SECONDS * 1000
            )
        )
    found += [
        Counter(
            f"network-hour:{source}:{hour}",
            NETWORK_TURNS_PER_HOUR,
            (hour + 1) * HOUR_MS,
        ),
        Counter(
            f"network-day:{source}:{day}", NETWORK_TURNS_PER_DAY, (day + 1) * DAY_MS
        ),
        Counter(f"all-day:{day}", TURNS_PER_DAY, (day + 1) * DAY_MS),
    ]
    return found


def _refusal(status: int, code: str, error: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "code": code})


async def _turns_of(database: Any, counter: Counter) -> int:
    statement = database.prepare(COUNT_SQL).bind(counter.bucket, counter.expires_at)
    row = await statement.first()
    row = row.to_py() if hasattr(row, "to_py") else row
    return int(row["turns"])


async def _within_limits(
    database: Any, session: Session, source: str, now: int
) -> bool:
    await database.prepare(PRUNE_SQL).bind(now).run()
    for counter in counters(session, source, now):
        if await _turns_of(database, counter) > counter.limit:
            return False
    return True


async def anonymous_turn_refusal(
    app: Any, session: Session, scope: Any
) -> HTTPException | None:
    """None for a signed-in account's session, which these limits are not for, and for an
    anonymous one still within them; else the refusal to send. A count that cannot be made
    refuses: an open chat that cannot be counted is an open bill."""
    if session.account:
        return None
    source = source_of(client_key(scope))
    try:
        async with asyncio.timeout(COUNT_TIMEOUT_SECONDS):
            within = await _within_limits(app.state.tv_db, session, source, now_ms())
    except Exception:
        logger.exception("The anonymous chat's turns could not be counted")
        return _refusal(503, TRY_UNAVAILABLE, "Try again in a moment")
    if within:
        return None
    return _refusal(429, TRY_LIMIT, "Try again later, or sign in to keep going")
