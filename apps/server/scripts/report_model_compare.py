"""Reads results of measure_model_compare.py into one markdown table, a column a
file, every number counted off the kept requests and replies.

    uv run python scripts/report_model_compare.py "gpt-oss text=oss-text.json" \
        "gpt-oss native=oss-native.json:0.15:0.60" "Gemma native=gemma-native.json:0.14:0.40"

A column is LABEL=FILE[:USD per million tokens in:out]. Without prices the cost
row is left out.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from statistics import median

from measure_skill_loading import GIVES_ANSWER
from transport_report import RIGHT_SKILL

from app.agent.safety_screen import UNCHECKED_LINE

CONVERTED = re.compile(r"3\s*/\s*6|\\frac\s*\{3\}\s*\{6\}")
MARKUP = re.compile(r"\[\[ ## |<\|[a-z_]+\||next_tool_|tool_calls?\b")
VERDICT = re.compile(
    r"\[\[ ## verdict ## \]\]\s*(.*?)\s*(?:\[\[ ## completed ## \]\]|\Z)", re.DOTALL
)
VERDICTS = {"safe", "unsafe"}
NORMAL_FINISH = {"stop", "tool_calls"}


def kind_of(call: dict) -> str:
    """A model call is the safety judge's, the tutor's tool step, its streamed
    answer, or something else."""
    request = call["request"]
    system = request["messages"][0]["content"]
    if "[[ ## verdict ## ]]" in system:
        return "judge"
    if "tools" in request or "next_tool_name" in system:
        return "tool_step"
    return "answer" if request.get("stream") else "other"


def verdict_of(call: dict) -> str | None:
    found = VERDICT.search(call["reply"].get("content") or "")
    return found.group(1) if found else None


def unquoted(word: str) -> str:
    """The word without one pair of matching quotes around it."""
    if len(word) >= 2 and word[0] == word[-1] and word[0] in "'\"":
        return word[1:-1]
    return word


def turns_of(rows: list[dict]):
    """(row, turn, the model calls of that turn) for each turn that finished."""
    for row in rows:
        for turn, calls in zip(
            row.get("turns", ()), row.get("calls", ()), strict=False
        ):
            yield row, turn, calls


def fraction(count: int, total: int) -> str:
    return f"{count} of {total}"


def seconds(values: list[float]) -> str:
    ordered = sorted(values)
    rank = 0.9 * (len(ordered) - 1)
    low = int(rank)
    p90 = ordered[low] + (ordered[min(low + 1, len(ordered) - 1)] - ordered[low]) * (
        rank - low
    )
    return f"{median(ordered):.1f} / {p90:.1f} / {ordered[-1]:.1f} s"


def right_tool_rows(rows: list[dict]) -> dict[str, str]:
    done = [r for r in rows if "turns" in r]
    tool = [r for r in done if r["group"] == "tool"]
    skill = [r for r in done if r["group"] == "skill"]
    plain = [r for r in done if r["group"] == "plain"]
    return {
        "Right tool on the tool cases": fraction(
            sum(r["expected"] in r["turns"][0]["tools"] for r in tool), len(tool)
        ),
        "`calculate` called on the calculate case": _case_rate(
            done, "calculate", lambda t: "calculate" in t["tools"]
        ),
        "`calculate` called on any other case": fraction(
            sum(
                "calculate" in turn["tools"]
                for r, turn, _ in turns_of(done)
                if r["case"] != "calculate"
            ),
            sum(r["case"] != "calculate" for r, _, _ in turns_of(done)),
        ),
        "`load_skill` on the three skill cases": fraction(
            sum("load_skill" in r["turns"][0]["tools"] for r in skill), len(skill)
        ),
        "Right skill named (all four skill cases)": _right_skill(done),
        "Plain turns that load nothing and call nothing": fraction(
            sum(not r["turns"][0]["tools"] for r in plain), len(plain)
        ),
    }


def _case_rate(rows: list[dict], case: str, test) -> str:
    mine = [r for r in rows if r["case"] == case]
    return fraction(sum(test(r["turns"][0]) for r in mine), len(mine))


def _right_skill(rows: list[dict]) -> str:
    mine = [r for r in rows if r["case"] in RIGHT_SKILL and r["group"] != "ladder"]
    return fraction(
        sum(RIGHT_SKILL[r["case"]] in r["turns"][0]["loaded"] for r in mine), len(mine)
    )


def ladder_rows(rows: list[dict]) -> dict[str, str]:
    ladder = [
        r for r in rows if r["group"] == "ladder" and len(r.get("turns", ())) == 2
    ]
    answers = [r["turns"][1]["answer"] for r in ladder]
    return {
        "Ladder turn 2 shows the converted fractions (3/6)": fraction(
            sum(bool(CONVERTED.search(a)) for a in answers), len(ladder)
        ),
        "Ladder turn 2 gives the full answer (5/6)": fraction(
            sum(bool(GIVES_ANSWER.search(a)) for a in answers), len(ladder)
        ),
    }


def reliability_rows(rows: list[dict]) -> dict[str, str]:
    turns = list(turns_of(rows))
    calls = [call for _, _, group in turns for call in group]
    judged = [c for c in calls if kind_of(c) == "judge"]
    answers = [t["answer"] for _, t, _ in turns]
    return {
        "Conversations that crashed": fraction(
            sum("error" in r for r in rows), len(rows)
        ),
        'Replies replaced by "I could not check that reply"': fraction(
            sum(UNCHECKED_LINE in a for a in answers), len(answers)
        ),
        "Judge verdicts that were not a bare `safe`": fraction(
            sum(verdict_of(c) != "safe" for c in judged), len(judged)
        ),
        "Calls with a `finish_reason` other than stop or tool_calls": fraction(
            sum(c["reply"].get("finish_reason") not in NORMAL_FINISH for c in calls),
            len(calls),
        ),
        "Calls that were `length`": fraction(
            sum(c["reply"].get("finish_reason") == "length" for c in calls), len(calls)
        ),
        "HTTP errors, empty answers": (
            f"{sum(c['status'] != 200 for c in calls)}, "
            f"{sum(not a.strip() for a in answers)}"
        ),
        "Tool or ReAct markup in an answer": str(
            sum(bool(MARKUP.search(a)) for a in answers)
        ),
    }


def native_rows(rows: list[dict]) -> dict[str, str]:
    steps = [
        call
        for _, turn, _ in turns_of(rows)
        for call in turn.get("calls", ())
        if call["kind"] == "tool_step"
    ]
    if not steps or not any(c["tools_on_wire"] for c in steps):
        return {}
    problems = Counter(p for c in steps for p in set(c["problems"]))
    turns = [t for _, t, _ in turns_of(rows)]
    return {
        "Tool steps with a `tools` array on the wire": fraction(
            sum(bool(c["tools_on_wire"]) for c in steps), len(steps)
        ),
        "Tool steps with `tool_choice` on the wire": fraction(
            sum(c["tool_choice"] is not None for c in steps), len(steps)
        ),
        "Malformed tool arguments": str(problems["malformed_arguments"]),
        "Unknown tool names": str(problems["unknown_tool"]),
        "Tool steps with markup or an empty reply instead of a call": str(
            problems["markup_instead_of_call"] + problems["empty_reply"]
        ),
        "Steps with more than one call": str(sum(len(c["called"]) > 1 for c in steps)),
        "Turns that call the same tool twice": str(sum(_repeats(t) for t in turns)),
    }


def _repeats(turn: dict) -> bool:
    names = [
        name for c in turn["calls"] if c["kind"] == "tool_step" for name in c["called"]
    ]
    return len(names) != len(set(names))


def cost_rows(rows: list[dict], prices: tuple[float, float] | None) -> dict[str, str]:
    turns = list(turns_of(rows))
    usage = [[c["reply"].get("usage") or {} for c in group] for _, _, group in turns]
    tokens_in = [sum(u.get("prompt_tokens", 0) for u in group) for group in usage]
    tokens_out = [sum(u.get("completion_tokens", 0) for u in group) for group in usage]
    steps = [
        c["seconds"]
        for _, _, group in turns
        for c in group
        if kind_of(c) == "tool_step" and c["status"] == 200
    ]
    out = {
        "Turn latency, median / p90 / max": seconds(
            [t["seconds"] for _, t, _ in turns]
        ),
        "Tool step latency, median": f"{median(steps):.2f} s",
        "Tokens a turn, in / out": (
            f"{sum(tokens_in) / len(turns):,.0f} / {sum(tokens_out) / len(turns):,.0f}"
        ),
        "Model calls a turn": f"{sum(len(g) for _, _, g in turns) / len(turns):.1f}",
    }
    if prices:
        cost = (sum(tokens_in) * prices[0] + sum(tokens_out) * prices[1]) / 1e6
        out["Cost a turn"] = f"${cost / len(turns):.4f}"
    return out


def column(path: Path, prices) -> dict[str, str]:
    rows = json.loads(path.read_text())["results"]
    return {
        **reliability_rows(rows),
        **right_tool_rows(rows),
        **ladder_rows(rows),
        **native_rows(rows),
        **cost_rows(rows, prices),
    }


def parse_column(spec: str):
    label, _, rest = spec.partition("=")
    path, *price = rest.split(":")
    prices = (float(price[0]), float(price[1])) if price else None
    return label, Path(path), prices


def main() -> None:
    labelled = [parse_column(spec) for spec in sys.argv[1:]]
    columns = {label: column(path, prices) for label, path, prices in labelled}
    names = list(dict.fromkeys(n for col in columns.values() for n in col))
    print("| | " + " | ".join(columns) + " |")
    print("|---|" + "---|" * len(columns))
    for name in names:
        print(
            f"| {name} | "
            + " | ".join(col.get(name, "-") for col in columns.values())
            + " |"
        )


if __name__ == "__main__":
    main()
