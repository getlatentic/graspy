"""Measures what a tutor chat turn loses when the client is cut off.

    uv run python scripts/chat/turn_loss.py https://graspy-api-staging.getlatentic.com --runs 5

Each scenario runs in fresh conversations. A turn carries a code word; a later
turn in the same conversation asks for it, so "kept" means the conversation
store holds the cut-off exchange. Nothing is read from the server's own state:
what is measured is what a learner would see.

  baseline           a whole turn: when the words arrive and how many events
  drop_after_task    the client leaves as soon as the task exists
  drop_after_delta   the client leaves at the first words
  resubscribe        after the first drop, the client asks for the same task again
  retry_after_drop   the client leaves, then sends the same message again, as the web app does
  no_retry           the control for the line above: the same message sent once
  overlap            a second message is sent while the first is still running
"""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from a2a_probe import Tutor, session_token

LONG_QUESTION = (
    "My code word is {code}. Now explain how to add 3/4 and 1/8 in four short steps."
)
SETTLE_SECONDS = 45
RECALL = "What was my code word? Reply with only the code word."


def code_word() -> str:
    return f"zebra-{secrets.randbelow(9000) + 1000}"


async def kept(tutor: Tutor, context_id: str, code: str) -> dict:
    """Whether the conversation holds the code word. A recall that failed says
    so, and is not counted as a loss."""
    asked = await tutor.turn(RECALL, context_id)
    if asked.error or not asked.finished:
        return {"kept": None, "recall_error": asked.error or "not finished"}
    return {"kept": code in asked.text, "recall_error": ""}


async def recalled(tutor: Tutor, context_id: str, code: str) -> dict:
    if not context_id:
        return {"kept": None, "recall_error": "the first turn gave no conversation"}
    return await kept(tutor, context_id, code)


async def baseline(tutor: Tutor) -> dict:
    code = code_word()
    seen = await tutor.turn(LONG_QUESTION.format(code=code))
    return {
        "finished": seen.finished,
        "first_words_s": seen.first("delta"),
        "total_s": seen.events[-1][0] if seen.events else None,
        "events": len(seen.events),
        "error": seen.error,
        **await recalled(tutor, seen.context_id, code),
    }


async def drop(tutor: Tutor, stop_after: str, resubscribe: bool = False) -> dict:
    code = code_word()
    seen = await tutor.turn(LONG_QUESTION.format(code=code), stop_after=stop_after)
    result: dict = {"left_at_s": seen.events[-1][0] if seen.events else None}
    if resubscribe and seen.task_id:
        again = await tutor.subscribe(seen.task_id)
        result["resubscribe"] = {
            "events": len(again.events),
            "finished": again.finished,
            "error": again.error,
        }
    await asyncio.sleep(SETTLE_SECONDS)
    result.update(await recalled(tutor, seen.context_id, code))
    return result


async def overlap(tutor: Tutor) -> dict:
    """Two messages in the same conversation, the second sent while the first runs."""
    opening_code, running_code, second_code = code_word(), code_word(), code_word()
    opened = await tutor.turn(
        f"My first code word is {opening_code}. Reply with only the word ok."
    )
    context_id = opened.context_id
    running = asyncio.create_task(
        tutor.turn(
            f"My second code word is {running_code}. Now explain how to add "
            "3/4 and 1/8 in four short steps.",
            context_id,
        )
    )
    await asyncio.sleep(1.0)
    second = await tutor.turn(
        f"My third code word is {second_code}. Reply with only the word ok.",
        context_id,
    )
    running_seen = await running
    await asyncio.sleep(5)
    all_three = await tutor.turn(
        "What were my three code words? Reply with only the three words.",
        context_id,
    )
    return {
        "running_finished": running_seen.finished,
        "running_error": running_seen.error,
        "second_finished": second.finished,
        "second_error": second.error,
        "opening_code_kept": opening_code in all_three.text,
        "running_code_kept": running_code in all_three.text,
        "second_code_kept": second_code in all_three.text,
    }


LIST_MESSAGES = (
    "List each message I sent in this conversation that mentions a code word, "
    "one per line, each line starting with the code word."
)


async def messages_with(tutor: Tutor, context_id: str, code: str) -> dict:
    """How many times the conversation holds the message: the lines of a list
    the model writes that carry the code word. The question does not contain it."""
    asked = await tutor.turn(LIST_MESSAGES, context_id)
    if asked.error or not asked.finished:
        return {"held": None, "recall_error": asked.error or "not finished"}
    lines = [line for line in asked.text.splitlines() if code in line]
    return {"held": len(lines), "recall_error": ""}


async def retry_after_drop(tutor: Tutor) -> dict:
    """The web client sends a message again 600 ms after a stream that ended
    before any words. It keeps the conversation id of an earlier message, so
    this holds for a second message and later ones, not a first. If the first
    turn also finishes, the conversation holds the message twice."""
    code = code_word()
    opened = await tutor.turn("Hello. Reply with only the word hi.")
    text = f"My code word is {code}. Reply with only the word ok."
    await tutor.turn(text, opened.context_id, stop_after="task")
    await asyncio.sleep(0.6)
    again = await tutor.turn(text, opened.context_id)
    await asyncio.sleep(SETTLE_SECONDS)
    return {
        "retry_finished": again.finished,
        **await messages_with(tutor, opened.context_id, code),
    }


async def no_retry(tutor: Tutor) -> dict:
    """The control: the same message sent once, and the same list."""
    code = code_word()
    opened = await tutor.turn("Hello. Reply with only the word hi.")
    await tutor.turn(
        f"My code word is {code}. Reply with only the word ok.", opened.context_id
    )
    return await messages_with(tutor, opened.context_id, code)


SCENARIOS = {
    "baseline": baseline,
    "drop_after_task": lambda tutor: drop(tutor, "task"),
    "drop_after_delta": lambda tutor: drop(tutor, "delta"),
    "resubscribe": lambda tutor: drop(tutor, "task", resubscribe=True),
    "retry_after_drop": retry_after_drop,
    "no_retry": no_retry,
    "overlap": overlap,
}


def summary(rows: list[dict]) -> dict:
    out: dict = {"runs": len(rows)}
    for key in rows[0]:
        values = [row.get(key) for row in rows]
        if key == "recall_error":
            out["recall_errors"] = [value for value in values if value]
        elif all(isinstance(value, bool) or value is None for value in values):
            yes = sum(1 for value in values if value is True)
            unknown = sum(1 for value in values if value is None)
            out[key] = f"{yes}/{len(values)} (unknown {unknown})"
        elif all(isinstance(value, (int, float)) or value is None for value in values):
            known = [value for value in values if value is not None]
            out[key] = {
                "median": round(statistics.median(known), 2) if known else None,
                "values": values,
            }
        else:
            out[key] = values
    return out


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("base")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--only", nargs="*", default=list(SCENARIOS))
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    results: dict = {"base": args.base, "scenarios": {}}
    for name in args.only:
        token = await session_token(
            args.base, f"turn-loss-{name}-{secrets.token_hex(3)}"
        )
        tutor = Tutor(args.base, token)
        rows = []
        for run in range(args.runs):
            row = await SCENARIOS[name](tutor)
            rows.append(row)
            print(f"{name} #{run + 1}: {json.dumps(row)}", flush=True)
        await tutor.close()
        results["scenarios"][name] = {"rows": rows, "summary": summary(rows)}
        print(f"== {name}: {json.dumps(summary(rows))}", flush=True)
    if args.out:
        args.out.write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
