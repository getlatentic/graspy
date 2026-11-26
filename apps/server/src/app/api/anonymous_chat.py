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
import json
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from ..learner.time import now_ms
from ..security.guard import Session
from ..security.rate_limit import source_of
from ..security.session import TOKEN_TTL_SECONDS
from ..turns.access import chat_owner

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
# returns the new count when it did, so the check and the add cannot be split by another turn. A
# refused statement returns no row, and an added one is believed only if its count is within the limit.
SPEND_SQL = (
    "INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES (?1, 1, ?2) "
    "ON CONFLICT (bucket) DO UPDATE SET turns = turns + 1 WHERE turns < ?3 "
    "RETURNING turns"
)
GIVE_BACK_SQL = (
    "UPDATE anonymous_chat_use SET turns = turns - 1 WHERE bucket = ?1 AND turns > 0"
)
FORGET_EMPTY_SQL = "DELETE FROM anonymous_chat_use WHERE bucket = ?1 AND turns <= 0"
# A turn that has been counted leaves a row of this kind, so it is never counted twice.
COUNTED_SQL = (
    "SELECT 1 AS counted FROM anonymous_chat_use WHERE bucket = ?1 AND expires_at > ?2"
)
MARK_SQL = "INSERT OR IGNORE INTO anonymous_chat_use (bucket, turns, expires_at) VALUES (?1, 1, ?2) RETURNING bucket"


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


def _turn_bucket(owner: str | None, chat: str, turn: str) -> str:
    """Hashed, since an A2A client chooses the lengths of the ids; the ids are hashed as a list, so
    no two sets of them make one key."""
    return (
        "turn:" + hashlib.sha256(json.dumps([owner, chat, turn]).encode()).hexdigest()
    )


async def _is_counted(database: Any, marker: str, now: int) -> bool:
    found = await database.prepare(COUNTED_SQL).bind(marker, now).all()
    return bool(_rows(found))


def _admitted(result: Any, limit: int) -> bool:
    rows = _rows(result)
    return bool(rows) and rows[0]["turns"] <= limit


async def _spend(database: Any, found: list[Counter], now: int) -> list[Counter]:
    """Deletes the counts of windows that are over, then adds the turn to every count still under
    its limit, in one transaction, and returns the
    counts it was added to. If the answer cannot be read after the batch has committed, the turn is
    given back to every count it may have been added to, and the error goes on."""
    results = await database.batch(
        [
            database.prepare(PRUNE_SQL).bind(now),
            *(
                database.prepare(SPEND_SQL).bind(c.bucket, c.expires_at, c.limit)
                for c in found
            ),
        ]
    )
    try:
        return [
            counter
            for counter, result in zip(found, results[1:], strict=True)
            if _admitted(result, counter.limit)
        ]
    except Exception:
        await _give_back(database, found)
        raise


async def _give_back(database: Any, spent: list[Counter]) -> None:
    statements = []
    for counter in spent:
        statements.append(database.prepare(GIVE_BACK_SQL).bind(counter.bucket))
        statements.append(database.prepare(FORGET_EMPTY_SQL).bind(counter.bucket))
    if statements:
        await database.batch(statements)


async def _count(
    database: Any, found: list[Counter], marker: str | None, now: int
) -> bool:
    """Adds the turn to every count, or to none when any is at its limit. Each count is added to
    by one statement that checks its own limit, so turns that race cannot pass a limit together. A
    turn refused by one count gives back what it added to the others, which another turn may see
    for a moment as spent: a limit is then reached a turn early, never passed.

    With a `marker` (the turn's key, for a server whose chat log keeps a turn once) a turn already
    counted, by a start sent again or by a second start of it racing the first, is admitted without
    being counted again. With none, every call is a run and is counted, so a repeated turn id buys
    nothing.

    What stays racy: a turn that is cut off (the timeout, a restart) between adding and giving
    back leaves its counts spent, and a refused turn's retry then finds them so."""
    if marker is not None and await _is_counted(database, marker, now):
        return True
    spent = await _spend(database, found, now)
    if len(spent) < len(found):
        await _give_back(database, spent)
        return False
    if marker is None:
        return True
    marked = await database.batch(
        [database.prepare(MARK_SQL).bind(marker, now + DAY_MS)]
    )
    if not _rows(marked[0]):
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
    database: Any,
    session: Session | None,
    address: str | None,
    chat: str,
    turn: str | None,
) -> HTTPException | None:
    """None for a signed-in account's session, which these limits are not for, and for an
    anonymous one still within them (the turn is then counted, once per chat and turn, or on every
    call when `turn` is None: a server with no chat log to keep a turn once); else the
    refusal to send. A count that cannot be made refuses: an open chat that cannot be counted is
    an open bill, and so is a call with no session to count it for."""
    if session is None:
        return _refusal(401, "session_required", "A session is required")
    if session.account:
        return None
    now = now_ms()
    try:
        async with asyncio.timeout(COUNT_TIMEOUT_SECONDS):
            marker = (
                None if turn is None else _turn_bucket(chat_owner(session), chat, turn)
            )
            within = await _count(
                database, counters(session, edge_network(address), now), marker, now
            )
    except Exception:
        logger.exception("The anonymous chat's turns could not be counted")
        return _refusal(503, TRY_UNAVAILABLE, "Try again in a moment")
    if within:
        return None
    return _refusal(429, TRY_LIMIT, "Try again later, or sign in to keep going")
