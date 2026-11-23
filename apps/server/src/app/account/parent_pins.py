"""The parent PIN of each account, kept in D1 (docs/PARENT_PIN.md), and the lockout that guards it.

Every attempt is charged before the PIN is compared, by one guarded statement: it counts the
attempt, starts a lock when the count reaches the limit, and answers only while the account is not
locked. Attempts that arrive together are therefore serialised by the database, and a request that
is cut off after the charge has still been counted. A correct PIN clears the count."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .parent_pin_kdf import (
    ITERATIONS,
    KDF,
    hash_pin,
    new_salt,
    pepper_of,
    same_hash,
)

MINUTE_MS = 60 * 1000
# Wrong PINs before a lock.
MAX_FAILURES = 5
# How long each successive lock lasts; the last repeats. A correct PIN, or a new PIN set after
# signing in with Google, starts again from the first.
LOCK_MS = (15 * MINUTE_MS, 60 * MINUTE_MS, 24 * 60 * MINUTE_MS)

CHARGE_SQL = (
    "UPDATE parent_pins SET "
    "failed_count = CASE WHEN failed_count + 1 >= ?3 THEN 0 ELSE failed_count + 1 END, "
    "lockouts = CASE WHEN failed_count + 1 >= ?3 THEN lockouts + 1 ELSE lockouts END, "
    "locked_until = CASE WHEN failed_count + 1 >= ?3 THEN ?2 + "
    "CASE lockouts WHEN 0 THEN ?4 WHEN 1 THEN ?5 ELSE ?6 END ELSE locked_until END, "
    "last_failed_at = ?2 "
    "WHERE account_uid = ?1 AND locked_until <= ?2 "
    "RETURNING salt, hash, iterations, pin_length, hint, failed_count, locked_until"
)
CLEAR_SQL = (
    "UPDATE parent_pins SET failed_count = 0, lockouts = 0, locked_until = 0, "
    "last_failed_at = NULL WHERE account_uid = ?1"
)
STATUS_SQL = (
    "SELECT pin_length, locked_until, set_at FROM parent_pins WHERE account_uid = ?1"
)
SET_SQL = (
    "INSERT INTO parent_pins (account_uid, salt, hash, kdf, iterations, pin_length, hint, set_at) "
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) "
    "ON CONFLICT (account_uid) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, "
    "kdf = excluded.kdf, iterations = excluded.iterations, pin_length = excluded.pin_length, "
    "hint = excluded.hint, set_at = excluded.set_at, failed_count = 0, lockouts = 0, "
    "locked_until = 0, last_failed_at = NULL"
)
FORGET_SQL = "DELETE FROM parent_pins WHERE account_uid = ?1"
SET_AT_SQL = "SELECT set_at FROM parent_pins WHERE account_uid = ?1"


@dataclass(frozen=True)
class PinStatus:
    length: int
    # Until when the account is locked, in milliseconds since the epoch; 0 when it is not.
    locked_until: int


@dataclass(frozen=True)
class Locked:
    until: int


@dataclass(frozen=True)
class Wrong:
    """The PIN was not the account's. `locked_until` is non-zero when this attempt locked it."""

    attempts_left: int
    locked_until: int


@dataclass(frozen=True)
class Correct:
    hint: str | None


@dataclass(frozen=True)
class NotSet:
    """The account holds no PIN."""


Outcome = Correct | Wrong | Locked | NotSet


def _row(found: Any) -> dict | None:
    if found is None:
        return None
    return found.to_py() if hasattr(found, "to_py") else dict(found)


async def status_of(database: Any, uid: str, now: int) -> PinStatus | None:
    row = _row(await database.prepare(STATUS_SQL).bind(uid).first())
    if row is None:
        return None
    return PinStatus(
        length=row["pin_length"],
        locked_until=row["locked_until"] if row["locked_until"] > now else 0,
    )


async def set_at(database: Any, uid: str) -> int | None:
    """When the PIN was last set, for ending the parent sessions made before."""
    row = _row(await database.prepare(SET_AT_SQL).bind(uid).first())
    return None if row is None else row["set_at"]


async def check(database: Any, secret: str, uid: str, pin: str, now: int) -> Outcome:
    """Charges one attempt, then compares."""
    charged = _row(
        await database.prepare(CHARGE_SQL)
        .bind(uid, now, MAX_FAILURES, *LOCK_MS)
        .first()
    )
    if charged is None:
        status = await status_of(database, uid, now)
        return NotSet() if status is None else Locked(status.locked_until)
    computed = await hash_pin(
        pepper_of(secret),
        uid,
        pin,
        bytes.fromhex(charged["salt"]),
        charged["iterations"],
    )
    if same_hash(charged["hash"], computed):
        await database.prepare(CLEAR_SQL).bind(uid).run()
        return Correct(charged["hint"])
    locked_until = charged["locked_until"] if charged["locked_until"] > now else 0
    left = 0 if locked_until else MAX_FAILURES - charged["failed_count"]
    return Wrong(left, locked_until)


async def save(
    database: Any, secret: str, uid: str, pin: str, hint: str | None, now: int
) -> None:
    """Sets the PIN, replacing any, and clears the lock: the caller has proved who they are."""
    salt = new_salt()
    hashed = await hash_pin(pepper_of(secret), uid, pin, salt)
    await (
        database.prepare(SET_SQL)
        .bind(uid, salt.hex(), hashed, KDF, ITERATIONS, len(pin), hint, now)
        .run()
    )


async def forget(database: Any, uid: str) -> None:
    await database.prepare(FORGET_SQL).bind(uid).run()
