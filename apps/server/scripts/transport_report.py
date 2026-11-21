"""Reads the results of measure_skill_loading.py as a tool-use report: per case,
whether the right tool was called on the turn that should call it, and over all
turns what the wire showed (finish reasons, malformed calls, markup, latency,
tokens, whether tools and a tool_choice were on the request).

    uv run python scripts/transport_report.py before.json after.json
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from statistics import mean

# The skill each load_skill case should load, by the conversation's first turn.
RIGHT_SKILL = {
    "mistake": "explaining-a-mistake",
    "example": "worked-example",
    "check": "checking-understanding",
    "ladder": "explaining-a-mistake",
}


def turns_of(results: list[dict]):
    for row in results:
        for number, turn in enumerate(row.get("turns", [])):
            yield row, number, turn


def first_turn_rows(results: list[dict]) -> dict[str, list[dict]]:
    """The turns with a tool they are expected to call: the first of each case."""
    cases: dict[str, list[dict]] = {}
    for row in results:
        if row.get("turns") and row["expected"] is not None:
            cases.setdefault(row["case"], []).append(row)
    return cases


def right_tool(results: list[dict]) -> list[str]:
    lines = []
    for case, rows in first_turn_rows(results).items():
        right = sum(row["expected"] in row["turns"][0]["tools"] for row in rows)
        named = (
            f", the right skill {sum(RIGHT_SKILL[case] in row['turns'][0]['loaded'] for row in rows)}/{len(rows)}"
            if case in RIGHT_SKILL
            else ""
        )
        lines.append(
            f"  {case:10} expected {rows[0]['expected']:13} called {right}/{len(rows)}{named}"
        )
    plain = [row for row in results if row.get("turns") and row["group"] == "plain"]
    quiet = sum(not row["turns"][0]["tools"] for row in plain)
    lines.append(f"  plain answers with no tool: {quiet}/{len(plain)}")
    return lines


def wire(results: list[dict]) -> list[str]:
    steps = [
        call
        for _, _, turn in turns_of(results)
        for call in turn["calls"]
        if call["kind"] == "tool_step"
    ]
    answers = [
        call
        for _, _, turn in turns_of(results)
        for call in turn["calls"]
        if call["kind"] == "answer"
    ]
    if not steps:
        return ["  no tool steps recorded"]
    problems = Counter(p for call in steps for p in set(call["problems"]))
    turns = [turn for _, _, turn in turns_of(results)]
    choices = Counter(str(call["tool_choice"]) for call in steps).most_common(2)
    wire_lines = (
        f"  tool steps: {len(steps)}; tools array on "
        f"{sum(bool(c['tools_on_wire']) for c in steps)}, tool_choice on "
        f"{sum(c['tool_choice'] is not None for c in steps)} {choices}, "
        f"next_thought asked on {sum(c['asks_for_thought'] for c in steps)}"
    )
    reasons = Counter(c["finish_reason"] for c in steps)
    answer_reasons = Counter(c["finish_reason"] for c in answers)
    tokens = mean(sum(_tokens(c) for c in t["calls"]) for t in turns)
    failed = sum("error" in row for row in results)
    return [
        wire_lines,
        f"  finish_reason of tool steps: {dict(reasons)}",
        f"  problems in tool steps: {dict(problems) or 'none'}",
        f"  tool step: {_cost(steps)}",
        f"  answer calls: {len(answers)}; finish_reason {dict(answer_reasons)}; {_cost(answers)}",
        (
            f"  turn: {mean(t['seconds'] for t in turns):.1f}s, {tokens:.0f} tokens in "
            f"tutor calls; errors {failed}/{len(results)} conversations"
        ),
    ]


def _tokens(call: dict) -> int:
    return (call["prompt_tokens"] or 0) + (call["completion_tokens"] or 0)


def _cost(calls: list[dict]) -> str:
    if not calls:
        return "none"
    closed = sum(c.get("closed_early", False) for c in calls)
    return (
        f"{mean(c['seconds'] for c in calls):.2f}s, "
        f"{mean(c['prompt_tokens'] or 0 for c in calls):.0f} prompt and "
        f"{mean(c['completion_tokens'] or 0 for c in calls):.0f} completion tokens"
        f"{f' ({closed} closed before the end, timed to the close)' if closed else ''}"
    )


def report(results: list[dict]) -> str:
    return "\n".join([*right_tool(results), *wire(results)])


if __name__ == "__main__":
    for name in sys.argv[1:]:
        print(f"== {name}")
        print(report(json.loads(Path(name).read_text())))
