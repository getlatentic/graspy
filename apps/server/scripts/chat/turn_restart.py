"""Sends a turn every few seconds and records how each ends, for a test that restarts the Worker.

    uv run python scripts/chat/turn_restart.py https://graspy-api-staging.getlatentic.com --seconds 30

The output is one line a turn: the conversation id (to look up its `turn.resumed` and `round.aborted`
events in the chat log), whether the stream finished, and the time it took. A redeploy does not end a
run in progress (110 of 110 turns sent during one finished with one run each); the staging kill test
of 2026-11-04 aborted the chat's object with `ctx.abort()` six seconds into its first run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from a2a_probe import Tutor, session_token

QUESTION = "Explain in twenty numbered steps, two sentences each, how to add 3/4 and 1/8 and check the sum."


async def one(tutor: Tutor, started: float, rows: list) -> None:
    sent = time.monotonic()
    seen = await tutor.turn(QUESTION)
    rows.append(
        {
            "at_s": round(sent - started, 1),
            "context": seen.context_id,
            "finished": seen.finished,
            "total_s": round(time.monotonic() - sent, 1),
            "error": seen.error,
        }
    )
    print(json.dumps(rows[-1]), flush=True)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("base")
    parser.add_argument("--seconds", type=int, default=360)
    parser.add_argument("--every", type=float, default=3.0)
    args = parser.parse_args()
    token = await session_token(args.base, f"turn-restart-{secrets.token_hex(3)}")
    tutor = Tutor(args.base, token)
    rows: list = []
    started = time.monotonic()
    tasks = []
    while time.monotonic() - started < args.seconds:
        tasks.append(asyncio.create_task(one(tutor, started, rows)))
        await asyncio.sleep(args.every)
    await asyncio.gather(*tasks)
    await tutor.close()
    print(f"turns {len(rows)}, finished {sum(r['finished'] for r in rows)}")


if __name__ == "__main__":
    asyncio.run(main())
