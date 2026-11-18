"""Reads a Cloudflare D1 database with SELECT statements and nothing else."""

from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Callable
from pathlib import Path

Reader = Callable[[str], list[dict]]

SERVER_DIR = Path(__file__).resolve().parents[2]
TIMEOUT_SECONDS = 120


def select_only(sql: str) -> str:
    """The statement, when it is one SELECT; anything else is refused before it leaves this machine."""
    statement = sql.strip().rstrip(";").strip()
    outside_text = re.sub(r"'(?:[^']|'')*'", "''", statement)
    if not re.match(r"select\b", statement, re.IGNORECASE) or ";" in outside_text:
        raise ValueError("only a single SELECT statement may be run")
    return statement


def rows_of(output: str) -> list[dict]:
    """The rows in what `wrangler d1 execute --json` printed after its banner."""
    start = output.find("[\n")
    results = json.loads(output[start:] if start >= 0 else output)
    if not results or not results[0].get("success"):
        raise RuntimeError("D1 did not report success")
    return results[0]["results"]


def wrangler_reader(database: str) -> Reader:
    """A reader of the named remote database through wrangler's own login."""

    def read(sql: str) -> list[dict]:
        done = subprocess.run(
            [
                "npx",
                "wrangler",
                "d1",
                "execute",
                database,
                "--remote",
                "--json",
                "--command",
                select_only(sql),
            ],
            cwd=SERVER_DIR,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
        if done.returncode != 0:
            raise RuntimeError(
                f"wrangler failed for {database}: {done.stderr.strip()[-400:]}"
            )
        return rows_of(done.stdout)

    return read
