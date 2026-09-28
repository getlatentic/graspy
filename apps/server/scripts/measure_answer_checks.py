"""Measure the answer checks on real lessons: draw JSS 1 and Primary 5 maths
lessons with the model and settings in .env and DSPy's cache off, and keep
every check's verdict and repair (domains/lesson/checked.py) with the
lessons as a learner receives them.

    uv run python scripts/measure_answer_checks.py --draws 2 --out checks.json
    uv run python scripts/measure_answer_checks.py --report checks.json

The report (answer_check_report.py) counts what the checks found and did,
re-checks the finished lessons, and lists every repair to be read: a check
in code can misjudge a question.
"""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import dataclasses
import json
import logging
from pathlib import Path

import dspy
from answer_check_report import report
from measure_stage_writing import model

from app.domains.lesson.service import LessonService
from app.education.catalogue import systems
from app.education.route import descriptor
from app.settings import Settings

logger = logging.getLogger("measure_answer_checks")

COUNTRY = "Nigeria"
SUBJECT = "Mathematics"
# (class, level id in NG.json, topics)
CLASSES = (
    (
        "JSS 1",
        "jss-1",
        (
            "Fractions, decimals and percentages",
            "Simple equations",
            "Ratio and percentages",
            "Equivalent fractions and simplification",
            "Addition and subtraction of fractions",
            "Measurement: length, mass and capacity",
        ),
    ),
    (
        "Primary 5",
        "primary-5",
        (
            "Decimal fractions",
            "Percentages",
            "Fractions: addition and subtraction",
            "Measurement: length and mass",
            "Money: naira and kobo",
            "Multiplication of decimals",
        ),
    ),
)
CONCURRENT_DRAWS = 6
_DRAWN: contextvars.ContextVar[list] = contextvars.ContextVar("drawn")


class _Kept(logging.Handler):
    """Each check's report, filed with the draw that made it."""

    def emit(self, record: logging.LogRecord) -> None:
        found = getattr(record, "answer_check", None)
        if found is not None:
            _DRAWN.get().append(dataclasses.asdict(found))


def _grades() -> dict[str, str]:
    nigeria = systems()["NG"]
    levels = {level.id: level for level in nigeria.levels}
    return {name: descriptor(nigeria, levels[level]) for name, level, _ in CLASSES}


async def draw(lm: dspy.LM, name: str, topic: str, language: str, number: int) -> dict:
    checks: list[dict] = []
    _DRAWN.set(checks)
    record = {"class": name, "topic": topic, "language": language, "draw": number}
    try:
        with dspy.context(lm=lm.copy()):
            finished = await LessonService().generate_lesson(
                country=COUNTRY,
                language=language,
                subject=SUBJECT,
                topic=topic,
                grade_level=_grades()[name],
            )
    except Exception as error:
        # A failed draw is counted, not fatal.
        logger.exception("Draw %d of %s %s failed", number, name, topic)
        return record | {"error": f"{type(error).__name__}: {error}"}
    return record | {
        "error": None,
        "complete": finished.success,
        "checks": checks,
        "lesson_wire": finished.lesson.model_dump(by_alias=True, mode="json"),
    }


def _asked(draws: int, translated: int) -> list[tuple[str, str, str, int]]:
    asked = [
        (name, topic, "English", number)
        for name, _, topics in CLASSES
        for topic in topics
        for number in range(draws)
    ]
    asked += [
        (name, topics[number % len(topics)], "Yoruba", number)
        for name, _, topics in CLASSES
        for number in range(translated)
    ]
    return asked


async def measure(settings: Settings, draws: int, translated: int) -> list[dict]:
    lm = model(settings)
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def gated(*asked) -> dict:
        async with gate:
            return await draw(lm, *asked)

    return await asyncio.gather(*(gated(*asked) for asked in _asked(draws, translated)))


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", type=Path, default=None)
    parser.add_argument("--draws", type=int, default=2, help="English draws per topic")
    parser.add_argument(
        "--translated", type=int, default=2, help="Yoruba lessons per class"
    )
    parser.add_argument("--out", type=Path, default=Path("answer_checks.json"))
    parser.add_argument("--report", type=Path, nargs="+")
    return parser.parse_args()


async def main() -> None:
    options = arguments()
    if options.report:
        report([json.loads(path.read_text()) for path in options.report])
        return
    checked = logging.getLogger("app.domains.lesson.checked")
    checked.setLevel(logging.DEBUG)
    checked.addHandler(_Kept())
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    records = await measure(settings, options.draws, options.translated)
    options.out.write_text(json.dumps(records, indent=1, ensure_ascii=False))
    report([records])


if __name__ == "__main__":
    asyncio.run(main())
