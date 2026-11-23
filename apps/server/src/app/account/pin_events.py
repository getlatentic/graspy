"""What happened to an account's parent PIN, kept for its parent to read (docs/PARENT_PIN.md): a
lock, the PIN turned off, set or reset, and what a PIN let through (a TV linked, a consent given).
A child burning guesses shows here. A parent's session made from Google acknowledges them; a
child's cannot."""

from __future__ import annotations

from typing import Any

# Security-relevant events of the PIN itself, and what a PIN let through: each group keeps its newest
# 200 per account, so a burst of one cannot push out the other (a child linking TVs must not evict
# the record of the wrong PINs). All of them are shown to the parent, except `set`.
SECURITY = ("locked", "disabled", "wrong", "set", "reset")
AUDIT = ("tv_linked", "consent")
KINDS = SECURITY + AUDIT
SHOWN = ("locked", "disabled", "wrong", "reset", "tv_linked", "consent")
KEEP = 200
SHOWN_PER_GROUP = 10


def _in(kinds: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{kind}'" for kind in kinds) + ")"


INSERT_SQL = (
    "INSERT INTO pin_events (account_uid, kind, at, count) VALUES (?1, ?2, ?3, ?4)"
)


def _trim(kinds: tuple[str, ...]) -> str:
    return (
        "DELETE FROM pin_events WHERE account_uid = ?1 "
        f"AND kind IN {_in(kinds)} AND id NOT IN "
        "(SELECT id FROM pin_events WHERE account_uid = ?1 "
        f"AND kind IN {_in(kinds)} ORDER BY id DESC LIMIT ?2)"
    )


def _unread(kinds: tuple[str, ...]) -> str:
    shown = tuple(kind for kind in kinds if kind in SHOWN)
    return (
        "SELECT id, kind, at, count FROM ("
        "SELECT id, kind, at, count FROM pin_events WHERE account_uid = ?1 "
        f"AND acknowledged_at IS NULL AND kind IN {_in(shown)} ORDER BY id DESC LIMIT ?2)"
    )


UNREAD_SQL = f"{_unread(SECURITY)} UNION ALL {_unread(AUDIT)} ORDER BY id DESC"
# Only what the parent was shown: events after the newest one the page held stay unread.
ACKNOWLEDGE_SQL = (
    "UPDATE pin_events SET acknowledged_at = ?2 "
    "WHERE account_uid = ?1 AND acknowledged_at IS NULL AND id <= ?3"
)
FORGET_SQL = "DELETE FROM pin_events WHERE account_uid = ?1"


async def record(
    database: Any, uid: str, kind: str, now: int, count: int | None = None
) -> None:
    assert kind in KINDS
    group = SECURITY if kind in SECURITY else AUDIT
    await database.batch(
        [
            database.prepare(INSERT_SQL).bind(uid, kind, now, count),
            database.prepare(_trim(group)).bind(uid, KEEP),
        ]
    )


async def unread(database: Any, uid: str) -> list[dict]:
    found = await database.prepare(UNREAD_SQL).bind(uid, SHOWN_PER_GROUP).all()
    return [
        row.to_py() if hasattr(row, "to_py") else dict(row) for row in found["results"]
    ]


async def acknowledge(database: Any, uid: str, now: int, up_to: int) -> None:
    await database.prepare(ACKNOWLEDGE_SQL).bind(uid, now, up_to).run()


async def forget(database: Any, uid: str) -> None:
    await database.prepare(FORGET_SQL).bind(uid).run()
