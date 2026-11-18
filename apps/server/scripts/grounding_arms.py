"""Writes every topic of the held NERDC JSS 1 Mathematics course twice over: grounded in the topic's objectives and
passages, as the lesson service writes it, and ungrounded, the same request with the curriculum switched off.

The model and settings are those of .env, DSPy's cache is off, and the lessons are English. Each lesson is one
record of the output file; a draw that fails is recorded with its error and counted, never dropped.

    uv run python scripts/grounding_arms.py --env-file ../.env --draws 2 --out arms.json
    uv run python scripts/grounding_arms.py --env-file ../.env --topics 2 --draws 1 --out try.json

Read by grounding_judge.py; the design is in docs/GROUNDING_RUBRIC.md.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from pathlib import Path

import dspy

from app.domains.curriculum.packages import held_course
from app.domains.lesson.service import LessonRequest, LessonService
from app.education.catalogue import systems
from app.education.route import descriptor
from app.llm.client import build_lm
from app.settings import Settings

logger = logging.getLogger("grounding_arms")

COUNTRY = "Nigeria"
SUBJECT = "Mathematics"
CONCURRENT_LESSONS = 4


def jss_1() -> str:
    nigeria = systems()["NG"]
    level = next(level for level in nigeria.levels if level.id == "jss-1")
    return descriptor(nigeria, level)


async def lesson_record(
    topic: str, grounded: bool, draw: int, lm: dspy.LM, grade_level: str
) -> dict:
    record = {
        "topic": topic,
        "arm": "grounded" if grounded else "ungrounded",
        "draw": draw,
        "error": None,
    }
    request = LessonRequest(
        COUNTRY, "English", SUBJECT, topic, grade_level, grounded=grounded
    )
    finished = None
    try:
        with dspy.context(lm=lm.copy()):
            async for event in LessonService().events(request):
                if event["type"] == "complete":
                    finished = event["payload"]
        if finished is None:
            raise RuntimeError("The lesson pipeline ended without a lesson")
    except Exception as error:
        logger.exception("%s (%s) draw %d failed", topic, record["arm"], draw)
        record["error"] = f"{type(error).__name__}: {error}"
        return record
    wire = finished.lesson.model_dump(by_alias=True, mode="json")
    record["complete"] = finished.success
    record["cited"] = wire["grounding"] is not None
    record["lesson_wire"] = wire
    return record


async def write_all(settings: Settings, topics: list[str], draws: int) -> list[dict]:
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    lm = build_lm(settings).copy(cache=False)
    grade_level = jss_1()
    gate = asyncio.Semaphore(CONCURRENT_LESSONS)

    async def gated(topic: str, grounded: bool, draw: int) -> dict:
        async with gate:
            return await lesson_record(topic, grounded, draw, lm, grade_level)

    return await asyncio.gather(
        *(
            gated(topic, grounded, draw)
            for topic in topics
            for draw in range(draws)
            for grounded in (True, False)
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--env-file", type=Path, default=None)
    parser.add_argument(
        "--draws", type=int, default=2, help="Lessons per topic per arm"
    )
    parser.add_argument(
        "--topics", type=int, default=None, help="Only the first N topics"
    )
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    settings = Settings(_env_file=args.env_file) if args.env_file else Settings()
    course = held_course("NG", "jss-1", SUBJECT)
    topics = course.topics()[: args.topics]
    records = asyncio.run(write_all(settings, topics, args.draws))
    args.out.write_text(json.dumps(records, ensure_ascii=False, indent=1))
    failed = [r for r in records if r["error"]]
    print(f"lessons: {len(records)}  failed: {len(failed)}  written to {args.out}")


if __name__ == "__main__":
    main()
