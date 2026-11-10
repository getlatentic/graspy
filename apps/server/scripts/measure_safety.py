"""Measure the reply-safety checkers on the labelled sentences in
safety_cases.json (planning #352): the rules, the model judge, and both. Each
case is judged as it would be in a turn; the model is the one in .env (gpt-oss-120b),
with DSPy's cache off. The cases were committed before the first run; the rules were
tuned on the dev split only, and the test split is what is reported.

    uv run python scripts/measure_safety.py --out safety.json [--env-file PATH] [--effort low]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import statistics
import time
from pathlib import Path

import dspy
from measure_stage_writing import model

from app.agent import safety_judge
from app.agent.safety_judge import judged
from app.agent.safety_rules import unsafe_in
from app.agent.said import Said
from app.settings import Settings

CASES = Path(__file__).with_name("safety_cases.json")
CONCURRENT = 8


def said_in(case: dict) -> Said:
    return Said(
        message=case.get("message", ""),
        learner="Class: JSS 1. Country: Nigeria",
        earlier=case.get("learner_said", ""),
    )


def by_rules(case: dict) -> str:
    found = unsafe_in(case["text"], said_in(case).text)
    return "safe" if found is None else found.value


async def timed_judge(case: dict, lm: dspy.LM) -> tuple[str, float]:
    start = time.perf_counter()
    with dspy.context(lm=lm):
        verdict = await judged(case["text"], case.get("before", ""), said_in(case))
    return verdict, time.perf_counter() - start


async def run(cases: list[dict], lm: dspy.LM, with_model: bool) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT)

    async def one(case: dict) -> dict:
        row = {
            "id": case["id"],
            "label": case["label"],
            "category": case["category"],
            "split": case["split"],
            "text": case["text"],
            "rules": by_rules(case),
        }
        if with_model:
            async with gate:
                try:
                    row["judge"], row["judge_s"] = await timed_judge(case, lm)
                except Exception as error:  # a failed call is a result to count
                    logging.getLogger(__name__).exception("judge failed")
                    row["judge"], row["judge_s"], row["error"] = (
                        "error",
                        0.0,
                        repr(error)[:200],
                    )
        return row

    return await asyncio.gather(*(one(case) for case in cases))


def blocked(row: dict, checker: str) -> bool:
    if row.get("judge") == "error" and checker != "rules":
        raise RuntimeError(f"The judge failed on {row['id']}: {row.get('error')}")
    if checker == "both":
        return blocked(row, "rules") or blocked(row, "judge")
    return row[checker] != "safe"


def report(rows: list[dict], checkers: list[str]) -> str:
    lines = []
    for split in ("dev", "test"):
        part = [r for r in rows if r["split"] == split]
        for checker in checkers:
            unsafe = [r for r in part if r["label"] == "unsafe"]
            safe = [r for r in part if r["label"] == "safe"]
            caught = sum(blocked(r, checker) for r in unsafe)
            over = sum(blocked(r, checker) for r in safe)
            lines.append(
                f"{split:4} {checker:6} caught {caught}/{len(unsafe)}  over-blocked {over}/{len(safe)}"
            )
    times = [r["judge_s"] for r in rows if r.get("judge_s")]
    if times:
        lines.append(
            f"judge seconds: median {statistics.median(times):.2f}, p90 {sorted(times)[int(len(times) * 0.9)]:.2f}, max {max(times):.2f}"
        )
    return "\n".join(lines)


def misses(rows: list[dict], checker: str, split: str) -> str:
    out = []
    for r in rows:
        if r["split"] != split:
            continue
        if r["label"] == "unsafe" and not blocked(r, checker):
            out.append(f"MISSED [{r['category']}] {r['text']}")
        if r["label"] == "safe" and blocked(r, checker):
            out.append(
                f"OVER   [{r['category']}] {r['text']} -> {r[checker if checker != 'both' else 'rules']}"
            )
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--env-file")
    parser.add_argument("--rules-only", action="store_true")
    parser.add_argument("--effort", default="low")
    parser.add_argument("--judge-effort", help="reasoning effort of the judge itself")
    parser.add_argument("--show", choices=["rules", "judge", "both"])
    parser.add_argument("--split", default="dev")
    options = parser.parse_args()
    cases = json.loads(CASES.read_text())["cases"]
    if options.judge_effort:
        safety_judge.JUDGE_EFFORT = options.judge_effort
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    lm = (
        model(settings).copy(reasoning_effort=options.effort)
        if not options.rules_only
        else None
    )
    rows = asyncio.run(run(cases, lm, not options.rules_only))
    options.out.write_text(json.dumps(rows, indent=1))
    print(report(rows, ["rules"] if options.rules_only else ["rules", "judge", "both"]))
    if options.show:
        print(misses(rows, options.show, options.split))


if __name__ == "__main__":
    main()
