"""Records the model calls of real lesson runs as input and output pairs.

Each lesson runs through the production pipeline, so a Yoruba lesson records
the English lesson and its translation exactly as a learner's request would.
Every call is appended to data/datasets/<stage>.jsonl, where the stage is the
lesson generator's predictor: plan_generator, slide_generator,
practice_generator, translate_slide or translate_practice.

The grade and topic are first put the way a learner's request carries them:
the grade in the country's own system, and the topic in the learner's language.

Makes live model calls with the settings in .env:

    uv run python scripts/generate_lesson_dataset.py
"""

import asyncio
import json
import logging
from pathlib import Path

import dspy
from dspy.utils.callback import BaseCallback
from pydantic_core import to_jsonable_python

from app.config.languages import needs_translation
from app.domains.curriculum.service import CurriculumService
from app.domains.lesson.service import LessonService
from app.education.catalogue import of_country
from app.llm.client import configure_dspy
from app.settings import get_settings

logger = logging.getLogger(__name__)

DATASET_DIR = Path("data/datasets")

# (subject, topic in English, grade as entered, language)
LESSONS = [
    ("Mathematics", "Fractions", "Grade 4", "English"),
    ("Physics", "Newton's Laws of Motion", "Grade 10", "English"),
    ("Chemistry", "Periodic Table", "Grade 11", "English"),
    ("Biology", "Photosynthesis", "Grade 8", "English"),
    ("History", "The Civil War", "Grade 10", "English"),
    ("English Literature", "Things Fall Apart by Chinua Achebe", "Grade 11", "English"),
    ("Social Studies", "Family Values", "Grade 3", "Yoruba"),
    ("Basic Science", "Personal Hygiene", "Grade 2", "Yoruba"),
    ("Agriculture", "Farming Tools", "Grade 7", "Yoruba"),
    ("Civic Education", "National Symbols", "Grade 4", "Hausa"),
    ("Mathematics", "Addition and Subtraction", "Grade 2", "Hausa"),
    ("Health Education", "Malaria Prevention", "Grade 7", "Hausa"),
    ("Social Studies", "Community Leadership", "Grade 5", "Igbo"),
    ("Basic Science", "Living and Non-Living Things", "Grade 3", "Igbo"),
    ("Cultural Creative Arts", "Traditional Dances", "Grade 7", "Igbo"),
]
COUNTRY = "Nigeria"
COUNTRY_CODE = "NG"


class StageRecorder(BaseCallback):
    """Appends each call of a named predictor to that stage's file."""

    def __init__(self, stages: dict[int, str], directory: Path) -> None:
        self._stages = stages
        self._directory = directory
        self._started: dict[str, tuple[str, dict]] = {}

    def on_module_start(self, call_id, instance, inputs) -> None:
        stage = self._stages.get(id(instance))
        if stage:
            self._started[call_id] = (stage, inputs.get("kwargs", inputs))

    def on_module_end(self, call_id, outputs, exception=None) -> None:
        stage, inputs = self._started.pop(call_id, (None, None))
        if stage is None or exception is not None:
            return
        record = {"input": inputs, "output": outputs.toDict()}
        with (self._directory / f"{stage}.jsonl").open("a", encoding="utf-8") as file:
            file.write(
                json.dumps(
                    to_jsonable_python(record, by_alias=True), ensure_ascii=False
                )
                + "\n"
            )


def grade_in_country(grade: str) -> str:
    """ "Grade N" as the country's main school system names its Nth year."""
    year = int(grade.removeprefix("Grade "))
    system = of_country(COUNTRY_CODE)[0]
    return next(level.name.en for level in system.levels if level.year == year)


async def learner_request(
    subject: str, topic: str, grade: str, language: str
) -> tuple[str, str]:
    """The grade and topic as they reach the lesson service in production."""
    if needs_translation(language):
        translated = await CurriculumService().translate_topics.acall(
            topics=[topic], subject=subject, target_language=language
        )
        topic = translated.translated_topics[0]
    return grade_in_country(grade), topic


async def main() -> None:
    logging.basicConfig(format="%(levelname)s | %(name)s | %(message)s")
    configure_dspy(get_settings())
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    lessons = LessonService()
    predictors = lessons.module.named_predictors()
    stages = {
        id(predictor): name.removesuffix(".predict") for name, predictor in predictors
    }
    dspy.configure(callbacks=[StageRecorder(stages, DATASET_DIR)])

    for number, (subject, topic, grade, language) in enumerate(LESSONS, start=1):
        print(f"[{number}/{len(LESSONS)}] {subject}: {topic} ({language})")
        try:
            grade_level, localized_topic = await learner_request(
                subject, topic, grade, language
            )
            print(f"  as the learner asks: {grade_level} | {localized_topic}")
            await lessons.generate_lesson(
                country=COUNTRY,
                language=language,
                subject=subject,
                topic=localized_topic,
                grade_level=grade_level,
            )
        except Exception:
            logger.exception("Lesson %d failed", number)

    for path in sorted(DATASET_DIR.glob("*.jsonl")):
        print(f"{path}: {sum(1 for _ in path.open(encoding='utf-8'))} records")


if __name__ == "__main__":
    asyncio.run(main())
