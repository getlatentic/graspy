"""Scores the lessons of grounding_arms.py against the rubric of docs/GROUNDING_RUBRIC.md with a model that is
shown one lesson at a time and never its arm, and prepares a blind sample for reading by hand.

The judge is gpt-oss-120b on Bedrock (the model in .env), never a Claude model. Each lesson is judged three times.

    uv run python scripts/grounding_judge.py judge --arms arms.json --out judged.json --env-file ../.env
    uv run python scripts/grounding_judge.py sample --arms arms.json --per-arm 8 --out sample
    uv run python scripts/grounding_judge.py report --judged judged.json [--hand hand.json --key sample-key.json]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
from pathlib import Path
from typing import Annotated

import dspy
from grounding_report import report
from judge_stage_writing import lesson_text
from pydantic import BaseModel, Field

from app.domains.curriculum.packages import held_course
from app.llm.client import build_lm
from app.settings import Settings

logger = logging.getLogger("grounding_judge")

CONCURRENT_CALLS = 6
REPEATS = 3
Score = Annotated[int, Field(ge=1, le=5)]


class Verdict(BaseModel):
    coverage: Score
    objectives_taught: list[int]
    correctness: Score
    wrong_items: list[str]
    level_fit: Score
    teachable: Score
    no_invention: Score
    invented_claims: list[str]


class JudgeLesson(dspy.Signature):
    """Score one JSS 1 Mathematics lesson, from 1 (poor) to 5 (excellent), on the rubric below. Judge only what the
    lesson says; its length and its style are no merit.

    - coverage: how much of the official objectives the lesson teaches (5 = every objective, 3 = about half, 1 =
      almost none). objectives_taught lists the numbers of the objectives it teaches.
    - correctness: every statement, worked step, marked answer and feedback is mathematically right. A marked
      answer is the option shown with [marked right]. One wrong marked answer or wrong working caps this at 2;
      wrong_items quotes each wrong item.
    - level_fit: vocabulary, notation and the size of each step suit a JSS 1 pupil of about 11 to 12 in Nigeria,
      and the content is neither above nor below the objectives' level.
    - teachable: a JSS 1 maths teacher could use the lesson in class as it stands: ordered, worked examples before
      practice, checks that test what was taught, no slide that needs rewriting first.
    - no_invention: the lesson makes no claim about the curriculum, an exam, a textbook, a standard or a rule that
      the objectives do not support (5 = none, 3 = one doubtful claim, 1 = several); invented_claims quotes each."""

    learner: str = dspy.InputField(desc="The class and country")
    topic: str = dspy.InputField()
    objectives: str = dspy.InputField(desc="The topic's official objectives, numbered")
    lesson: str = dspy.InputField()

    verdict: Verdict = dspy.OutputField()


def numbered_objectives(topic: str) -> list[str]:
    course = held_course("NG", "jss-1", "Mathematics")
    return [o.statement for o in course.topic(topic).objectives]


async def judged(record: dict, repeat: int, judge: dspy.LM) -> dict:
    objectives = numbered_objectives(record["topic"])
    if not objectives:
        raise ValueError(f"No official objectives for {record['topic']}")
    out = {
        "id": record["id"],
        "repeat": repeat,
        "objectives": len(objectives),
        "error": None,
    }
    try:
        with dspy.context(lm=judge):
            result = await dspy.Predict(JudgeLesson).acall(
                learner="JSS 1, Nigeria, age 11 to 12",
                topic=record["topic"],
                objectives="\n".join(f"{n}. {o}" for n, o in enumerate(objectives, 1)),
                lesson=lesson_text(record["lesson_wire"]),
            )
    except Exception as error:
        logger.exception("Judging %s failed", record["id"])
        out["error"] = f"{type(error).__name__}: {error}"
        return out
    return out | result.verdict.model_dump()


def with_ids(records: list[dict], seed: int) -> list[dict]:
    """Every lesson that finished, with a random id that tells nothing of its arm or topic."""
    made = [r for r in records if not r["error"]]
    ids = random.Random(seed).sample(range(1000, 10000), len(made))
    return [r | {"id": f"L{n}"} for r, n in zip(made, ids, strict=True)]


async def judge_all(records: list[dict], settings: Settings) -> list[dict]:
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    lm = build_lm(settings).copy(cache=False)
    gate = asyncio.Semaphore(CONCURRENT_CALLS)

    async def gated(record: dict, repeat: int) -> dict:
        async with gate:
            return await judged(record, repeat, lm)

    return await asyncio.gather(*(gated(r, n) for n in range(REPEATS) for r in records))


def write_sample(records: list[dict], per_arm: int, seed: int, out: Path) -> None:
    """A blind, shuffled sample as one readable file and a key kept apart; reading comes before the key is opened."""
    rng = random.Random(seed)
    chosen = []
    for arm in ("grounded", "ungrounded"):
        of_arm = [r for r in records if r["arm"] == arm]
        chosen += rng.sample(of_arm, min(per_arm, len(of_arm)))
    rng.shuffle(chosen)
    parts = []
    for r in chosen:
        objectives = "\n".join(
            f"{n}. {o}" for n, o in enumerate(numbered_objectives(r["topic"]), 1)
        )
        parts.append(
            f"=====  {r['id']}  =====\nTopic: {r['topic']}\nOfficial objectives:\n{objectives}\n\n"
            f"{lesson_text(r['lesson_wire'])}\n"
        )
    out.with_name(out.name + ".md").write_text("\n".join(parts))
    key = {
        r["id"]: {"arm": r["arm"], "topic": r["topic"], "draw": r["draw"]}
        for r in chosen
    }
    out.with_name(out.name + "-key.json").write_text(json.dumps(key, indent=1))


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("mode", choices=["judge", "sample", "report"])
    parser.add_argument("--arms", type=Path)
    parser.add_argument("--judged", type=Path)
    parser.add_argument(
        "--key", type=Path, help="Arms of the blind sample, from `sample`"
    )
    parser.add_argument("--hand", type=Path, help="Scores read by hand, by lesson id")
    parser.add_argument("--env-file", type=Path, default=None)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--per-arm", type=int, default=8)
    parser.add_argument("--seed", type=int, default=537)
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    if args.mode == "report":
        report(args.judged, args.hand, args.key)
        return
    records = with_ids(json.loads(args.arms.read_text()), args.seed)
    if args.mode == "sample":
        write_sample(records, args.per_arm, args.seed, args.out)
        return
    settings = Settings(_env_file=args.env_file) if args.env_file else Settings()
    results = asyncio.run(judge_all(records, settings))
    key = {
        r["id"]: {k: r[k] for k in ("arm", "topic", "draw", "complete")}
        for r in records
    }
    args.out.write_text(json.dumps({"key": key, "results": results}, indent=1))
    print(f"scored {len(results)} judgments of {len(records)} lessons -> {args.out}")


if __name__ == "__main__":
    main()
