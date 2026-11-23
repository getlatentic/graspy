"""What happened to an account's parent PIN, kept for its parent to read (docs/PARENT_PIN.md): a
lock, the PIN turned off, set or reset, and what a PIN let through (a TV linked, a consent given).
A child burning guesses shows here. A parent's session made from Google acknowledges them; a
child's cannot."""

from __future__ import annotations

from typing import Any

KINDS = ("locked", "disabled", "set", "reset", "tv_linked", "consent")
# The kinds a parent is shown as a notice; the rest are an audit trail.
NOTICED = ("locked", "disabled", "reset")
KEEP = 50

INSERT_SQL = (
    "INSERT INTO pin_events (account_uid, kind, at, count) VALUES (?1, ?2, ?3, ?4)"
)
TRIM_SQL = (
    "DELETE FROM pin_events WHERE account_uid = ?1 AND id NOT IN "
    "(SELECT id FROM pin_events WHERE account_uid = ?1 ORDER BY id DESC LIMIT ?2)"
)
UNREAD_SQL = (
    "SELECT id, kind, at, count FROM pin_events WHERE account_uid = ?1 "
    "AND acknowledged_at IS NULL AND kind IN ('locked', 'disabled', 'reset') ORDER BY id DESC LIMIT 10"
)
ACKNOWLEDGE_SQL = "UPDATE pin_events SET acknowledged_at = ?2 WHERE account_uid = ?1 AND acknowledged_at IS NULL"
FORGET_SQL = "DELETE FROM pin_events WHERE account_uid = ?1"


async def record(
    database: Any, uid: str, kind: str, now: int, count: int | None = None
) -> None:
    assert kind in KINDS
    await database.batch(
        [
            database.prepare(INSERT_SQL).bind(uid, kind, now, count),
            database.prepare(TRIM_SQL).bind(uid, KEEP),
        ]
    )


async def unread(database: Any, uid: str) -> list[dict]:
    found = await database.prepare(UNREAD_SQL).bind(uid).all()
    return [
        row.to_py() if hasattr(row, "to_py") else dict(row) for row in found["results"]
    ]


async def acknowledge(database: Any, uid: str, now: int) -> None:
    await database.prepare(ACKNOWLEDGE_SQL).bind(uid, now).run()


async def forget(database: Any, uid: str) -> None:
    await database.prepare(FORGET_SQL).bind(uid).run()
