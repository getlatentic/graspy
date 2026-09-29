"""D1 for local runs and tests: SQLite in memory, built from the migrations, in
the shapes the Workers runtime hands Python (rows as dicts, a write's result
with ``meta``). A batch is one transaction, as it is on D1."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from types import SimpleNamespace

MIGRATIONS = Path(__file__).parents[2] / "migrations"
# Pyodide hands a Python integer past 2**52 to D1 as a JavaScript BigInt, which D1 refuses.
MAX_BOUND_INTEGER = 2**52


class Statement:
    def __init__(self, connection: sqlite3.Connection, sql: str, values=()) -> None:
        self._connection, self._sql, self._values = connection, sql, values

    def bind(self, *values) -> Statement:
        for value in values:
            if isinstance(value, int) and abs(value) > MAX_BOUND_INTEGER:
                raise OverflowError(f"D1 cannot bind the integer {value}")
        return Statement(self._connection, self._sql, values)

    def rows(self) -> list[dict]:
        return [dict(row) for row in self._connection.execute(self._sql, self._values)]

    async def first(self) -> dict | None:
        row = self._connection.execute(self._sql, self._values).fetchone()
        return None if row is None else dict(row)

    async def all(self) -> dict:
        return {"results": self.rows()}

    async def run(self) -> SimpleNamespace:
        cursor = self._connection.execute(self._sql, self._values)
        self._connection.commit()
        return SimpleNamespace(meta=SimpleNamespace(changes=cursor.rowcount))


class LocalD1:
    def __init__(self) -> None:
        # One event loop's thread uses it, though not always the one that made it.
        self.connection = sqlite3.connect(":memory:", check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        # D1 refuses a string or blob over 2 MB.
        self.connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 2_000_000)
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            self.connection.executescript(migration.read_text())

    def prepare(self, sql: str) -> Statement:
        return Statement(self.connection, sql)

    async def batch(self, statements: list[Statement]) -> list[dict]:
        try:
            results = [{"results": statement.rows()} for statement in statements]
        except sqlite3.Error:
            self.connection.rollback()
            raise
        self.connection.commit()
        return results
