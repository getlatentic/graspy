"""The parent PIN of each account, kept in D1 (docs/PARENT_PIN.md), and the lockout that guards it.

Every attempt is charged before the PIN is compared, by one guarded statement that answers only
while the account is not locked or disabled, has fewer than five uncleared wrong PINs and fewer
than fifteen since the last Google proof, so attempts that arrive together are serialised by the
database: at most five are compared per lock. A request cut off after the charge has still been
counted.

Two counters, for two different things. `failed_count` is the lock: wrong PINs since the last lock
or success, five of which start a lock of 15 minutes, an hour, then a day (the ladder, `lockouts`,
which steps down one rung for each clean week and is not reset by a success). `proof_wrong` is the
budget: every wrong PIN since the last Google proof adds one, **a success does not take any
back** (it gives back only its own attempt's charge), and at fifteen the PIN is disabled until the
parent proves themselves with Google, which is the only thing that clears it. So a child who does
not know the PIN gets exactly 15 guesses per Google proof, whatever the parent does between."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import pin_events
from .parent_pin_kdf import (
    ITERATIONS,
    KDF,
    KDF_VERSION,
    MAX_ITERATIONS,
    MIN_ITERATIONS,
    hash_pin,
    new_salt,
    pepper_id,
    pepper_of,
    same_hash,
)

MINUTE_MS = 60 * 1000
DAY_MS = 24 * 60 * MINUTE_MS
# Wrong PINs before a lock.
MAX_FAILURES = 5
# How long each successive lock lasts; the last repeats.
LOCK_MS = (15 * MINUTE_MS, 60 * MINUTE_MS, DAY_MS)
# Wrong PINs since the last Google proof after which the PIN is disabled.
MAX_PROOF_WRONG = 15
# The ladder steps down one rung for each this long without a lock.
DECAY_MS = 7 * DAY_MS
# Wrong PINs in a row (three) that are worth telling the parent of even when they do not lock.
BURST = 3

# Timestamps are cast, so the arithmetic on them is integer arithmetic on D1 as on SQLite, whatever
# type the binding hands over.
_NOW = "CAST(?2 AS INTEGER)"
_RETURNED = (
    "RETURNING salt, hash, kdf, kdf_version, iterations, pepper_id, pin_length, hint, "
    "failed_count, proof_wrong"
)
CHARGE_SQL = (
    "UPDATE parent_pins SET failed_count = failed_count + 1, proof_wrong = proof_wrong + 1 "
    f"WHERE account_uid = ?1 AND locked_until <= {_NOW} AND disabled = 0 "
    "AND failed_count < ?3 AND proof_wrong < ?9 "
    "AND pepper_id = ?4 AND kdf = ?5 AND kdf_version = ?6 AND iterations BETWEEN ?7 AND ?8 "
    + _RETURNED
)
_RUNG = f"MAX(0, lockouts - ({_NOW} - COALESCE(last_failed_at, {_NOW})) / CAST(?7 AS INTEGER))"
LOCK_SQL = (
    "UPDATE parent_pins SET "
    f"lockouts = {_RUNG} + 1, "
    f"locked_until = {_NOW} + CASE {_RUNG} WHEN 0 THEN ?4 WHEN 1 THEN ?5 ELSE ?6 END, "
    f"failed_count = 0, last_failed_at = {_NOW} "
    f"WHERE account_uid = ?1 AND failed_count >= ?3 AND locked_until <= {_NOW} AND disabled = 0 "
    "RETURNING locked_until"
)
DISABLE_SQL = (
    "UPDATE parent_pins SET disabled = 1 "
    "WHERE account_uid = ?1 AND proof_wrong >= ?2 AND disabled = 0 RETURNING disabled"
)
# A right PIN: the count of wrong ones in a row is cleared, and its own attempt's charge is given
# back. The wrong ones before it stay counted.
CLEAR_SQL = (
    "UPDATE parent_pins SET failed_count = 0, "
    "proof_wrong = CASE WHEN proof_wrong > 0 THEN proof_wrong - 1 ELSE 0 END "
    "WHERE account_uid = ?1"
)
READ_SQL = (
    "SELECT pin_length, locked_until, disabled, failed_count, proof_wrong, pepper_id, kdf, "
    "kdf_version, iterations FROM parent_pins WHERE account_uid = ?1"
)
# A Google proof: the PIN is replaced, the lock and the disabling end, and the 15 guesses start
# again. How far up the ladder the account is stays, and decays with time.
SET_SQL = (
    "INSERT INTO parent_pins (account_uid, salt, hash, kdf, kdf_version, iterations, pepper_id, "
    "pin_length, hint, set_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) "
    "ON CONFLICT (account_uid) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, "
    "kdf = excluded.kdf, kdf_version = excluded.kdf_version, iterations = excluded.iterations, "
    "pepper_id = excluded.pepper_id, pin_length = excluded.pin_length, hint = excluded.hint, "
    "set_at = excluded.set_at, failed_count = 0, proof_wrong = 0, disabled = 0, locked_until = 0"
)
# Changing it with the old PIN: written only if the PIN is still the one that was typed.
CHANGE_SQL = (
    "UPDATE parent_pins SET salt = ?3, hash = ?4, kdf = ?5, kdf_version = ?6, iterations = ?7, "
    "pepper_id = ?8, pin_length = ?9, set_at = ?10, failed_count = 0 "
    "WHERE account_uid = ?1 AND hash = ?2"
)
EXISTS_SQL = "SELECT 1 AS found FROM parent_pins WHERE account_uid = ?1"
FORGET_SQL = "DELETE FROM parent_pins WHERE account_uid = ?1"
SET_AT_SQL = "SELECT set_at FROM parent_pins WHERE account_uid = ?1"


@dataclass(frozen=True)
class PinStatus:
    length: int
    # Until when the account is locked, in milliseconds since the epoch; 0 when it is not.
    locked_until: int
    # Fifteen wrong PINs since the last Google proof: only Forgot PIN works.
    disabled: bool


@dataclass(frozen=True)
class Locked:
    until: int


@dataclass(frozen=True)
class Disabled:
    pass


@dataclass(frozen=True)
class Wrong:
    attempts_left: int


@dataclass(frozen=True)
class Correct:
    hint: str | None
    # What the PIN's hash was when it was typed, for a change to be written only against it.
    hash: str


@dataclass(frozen=True)
class NotSet:
    """The account holds no PIN, or one made under a pepper that is gone."""


Outcome = Correct | Wrong | Locked | Disabled | NotSet


def _row(found: Any) -> dict | None:
    if found is None:
        return None
    return found.to_py() if hasattr(found, "to_py") else dict(found)


def _live(row: dict | None, secret: str) -> bool:
    """A row this server can check a PIN against: made under today's pepper, and a function and
    iteration count it accepts."""
    return (
        row is not None
        and row["pepper_id"] == pepper_id(pepper_of(secret))
        and row["kdf"] == KDF
        and row["kdf_version"] == KDF_VERSION
        and MIN_ITERATIONS <= row["iterations"] <= MAX_ITERATIONS
    )


async def _read(database: Any, uid: str) -> dict | None:
    return _row(await database.prepare(READ_SQL).bind(uid).first())


async def status_of(database: Any, secret: str, uid: str, now: int) -> PinStatus | None:
    row = await _read(database, uid)
    if not _live(row, secret):
        return None
    return PinStatus(
        length=row["pin_length"],
        locked_until=row["locked_until"] if row["locked_until"] > now else 0,
        disabled=bool(row["disabled"]),
    )


async def set_at(database: Any, uid: str) -> int | None:
    """When the PIN was last set, for ending the parent sessions made before."""
    row = _row(await database.prepare(SET_AT_SQL).bind(uid).first())
    return None if row is None else row["set_at"]


async def exists(database: Any, uid: str) -> bool:
    return await database.prepare(EXISTS_SQL).bind(uid).first() is not None


async def _lock(database: Any, uid: str, now: int) -> Locked | None:
    """Starts the lock once five wrong PINs are counted, if no one has: None when there is
    nothing to lock."""
    locked = _row(
        await database.prepare(LOCK_SQL)
        .bind(uid, now, MAX_FAILURES, *LOCK_MS, DECAY_MS)
        .first()
    )
    if locked is None:
        return None
    await pin_events.record(database, uid, "locked", now, MAX_FAILURES)
    return Locked(locked["locked_until"])


async def _disable(database: Any, uid: str, now: int) -> Disabled | None:
    """Turns the PIN off once fifteen wrong PINs are counted since the last Google proof."""
    off = _row(await database.prepare(DISABLE_SQL).bind(uid, MAX_PROOF_WRONG).first())
    if off is None:
        return None
    await pin_events.record(database, uid, "disabled", now, MAX_PROOF_WRONG)
    return Disabled()


async def _refused(database: Any, secret: str, uid: str, now: int) -> Outcome:
    """Why the charge answered nothing."""
    row = await _read(database, uid)
    if not _live(row, secret):
        return NotSet()
    if row["disabled"]:
        return Disabled()
    # Fifteen wrong PINs counted and the PIN not yet turned off (the one who counted the fifteenth
    # was cut off): it is turned off now.
    if row["proof_wrong"] >= MAX_PROOF_WRONG:
        return await _disable(database, uid, now) or Disabled()
    if row["locked_until"] > now:
        return Locked(row["locked_until"])
    # Five wrong PINs counted and the lock not yet written: it is written now.
    return await _lock(database, uid, now) or await _refused_after(database, uid, now)


async def _refused_after(database: Any, uid: str, now: int) -> Outcome:
    row = await _read(database, uid)
    if row and row["disabled"]:
        return Disabled()
    if row and row["locked_until"] > now:
        return Locked(row["locked_until"])
    return Locked(now + LOCK_MS[0])


async def check(database: Any, secret: str, uid: str, pin: str, now: int) -> Outcome:
    """Charges one attempt, then compares."""
    charged = _row(
        await database.prepare(CHARGE_SQL)
        .bind(
            uid,
            now,
            MAX_FAILURES,
            pepper_id(pepper_of(secret)),
            KDF,
            KDF_VERSION,
            MIN_ITERATIONS,
            MAX_ITERATIONS,
            MAX_PROOF_WRONG,
        )
        .first()
    )
    if charged is None:
        return await _refused(database, secret, uid, now)
    computed = await hash_pin(
        pepper_of(secret),
        uid,
        pin,
        bytes.fromhex(charged["salt"]),
        charged["iterations"],
    )
    if same_hash(charged["hash"], computed):
        await database.prepare(CLEAR_SQL).bind(uid).run()
        return Correct(charged["hint"], charged["hash"])
    if charged["failed_count"] == BURST:
        await pin_events.record(database, uid, "wrong", now, BURST)
    locked = await _lock(database, uid, now)
    disabled = await _disable(database, uid, now)
    if disabled is not None:
        return disabled
    if locked is not None:
        return locked
    row = await _read(database, uid)
    if row and row["disabled"]:
        return Disabled()
    if row and row["locked_until"] > now:
        return Locked(row["locked_until"])
    return Wrong(MAX_FAILURES - charged["failed_count"])


async def _made(secret: str, uid: str, pin: str):
    salt = new_salt()
    hashed = await hash_pin(pepper_of(secret), uid, pin, salt)
    return salt.hex(), hashed


async def save(
    database: Any, secret: str, uid: str, pin: str, hint: str | None, now: int
) -> None:
    """Sets the PIN, replacing any, after a Google proof: the lock and the disabling end."""
    salt, hashed = await _made(secret, uid, pin)
    await (
        database.prepare(SET_SQL)
        .bind(
            uid,
            salt,
            hashed,
            KDF,
            KDF_VERSION,
            ITERATIONS,
            pepper_id(pepper_of(secret)),
            len(pin),
            hint,
            now,
        )
        .run()
    )


async def change(
    database: Any, secret: str, uid: str, pin: str, old_hash: str, now: int
) -> bool:
    """Replaces the PIN that had `old_hash` when it was typed; False if it is no longer that one
    (it was changed meanwhile), and nothing is written."""
    salt, hashed = await _made(secret, uid, pin)
    result = (
        await database.prepare(CHANGE_SQL)
        .bind(
            uid,
            old_hash,
            salt,
            hashed,
            KDF,
            KDF_VERSION,
            ITERATIONS,
            pepper_id(pepper_of(secret)),
            len(pin),
            now,
        )
        .run()
    )
    return int(result.meta.changes) > 0


async def forget(database: Any, uid: str) -> None:
    await database.batch(
        [
            database.prepare(FORGET_SQL).bind(uid),
            database.prepare(pin_events.FORGET_SQL).bind(uid),
        ]
    )
