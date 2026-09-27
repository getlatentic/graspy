"""Measure how the tutor and topic lessons write for each stage of schooling.

For each learner, draws a whole topic lesson (plan, slides, practice
question) and two tutor answers, with the model and settings in .env and
DSPy's cache off, then scores the learner's text with reading_level.py,
the lesson's questions with lesson_checks.py, and checks that the tutor's
persona names the learner's stage (stage_report.py).

    uv run python scripts/measure_stage_writing.py --inspect
    uv run python scripts/measure_stage_writing.py --draws 3 --out after.json
    uv run python scripts/measure_stage_writing.py --compare before.json after.json

--inspect prints the request body of one tutor call as it went on the wire,
headers left out, and the reply.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import dspy
import httpx
from stage_report import report

from app.agent.context import LearnerContext
from app.agent.memory import InMemoryConversationStore
from app.agent.tutor import Tutor, TutorReply
from app.config.generation import DEFAULT_GRADE_LEVEL
from app.config.stage_writing import WRITING
from app.domains.lesson.lesson import Lesson
from app.domains.lesson.service import LessonService
from app.education.catalogue import systems
from app.education.route import descriptor
from app.education.stage import stage_of
from app.llm.client import build_lm
from app.llm.transport import HttpxTransport
from app.settings import Settings

logger = logging.getLogger("measure_stage_writing")

COUNTRY = "Nigeria"
LANGUAGE = "English"
QUESTIONS = (
    "Why do we see lightning before we hear thunder?",
    "What is a fraction? Give me an example.",
)
# (name, level id in NG.json or None for a class the catalogue cannot place,
# subject, topic)
LEARNERS = (
    ("Primary 2", "primary-2", "Mathematics", "Halves and quarters"),
    ("Primary 5", "primary-5", "Basic Science and Technology", "The water cycle"),
    ("JSS 1", "jss-1", "Mathematics", "Fractions and decimals"),
    ("SS 2", "sss-2", "Biology", "Photosynthesis"),
    ("Unknown", None, "Mathematics", "Fractions and decimals"),
)
# The adapter indents the instructions, so a blank line may hold spaces.
PERSONA = re.compile(r"You are graspy, (.*?)(?:\n\s*\n|$)", re.DOTALL)
CONCURRENT_DRAWS = 6


@dataclass(frozen=True)
class Learner:
    name: str
    grade_level: str
    subject: str
    topic: str

    @property
    def limit(self) -> int | None:
        stage = stage_of(self.grade_level)
        return WRITING[stage.stage].max_sentence_words if stage else None

    @property
    def school(self) -> str | None:
        stage = stage_of(self.grade_level)
        return WRITING[stage.stage].school if stage else None


def learners() -> list[Learner]:
    nigeria = systems()["NG"]
    levels = {level.id: level for level in nigeria.levels}
    return [
        Learner(
            name,
            descriptor(nigeria, levels[level]) if level else DEFAULT_GRADE_LEVEL,
            subject,
            topic,
        )
        for name, level, subject, topic in LEARNERS
    ]


def lesson_texts(lesson: Lesson) -> list[str]:
    """The prose the learner reads; options are fragments, not sentences."""
    texts = [*lesson.objectives, *lesson.key_points]
    for slide in lesson.slides:
        check = slide.assessment
        texts += [
            slide.body_md,
            check.prompt,
            check.correct_feedback,
            check.incorrect_feedback,
        ]
    if lesson.practice:
        practice = lesson.practice
        texts += [
            practice.question,
            practice.correct_feedback,
            practice.incorrect_feedback,
        ]
    return texts


def persona(lm: dspy.LM) -> str:
    system = lm.history[0]["messages"][0]["content"]
    found = PERSONA.search(system)
    return " ".join(found.group(1).split()) if found else ""


async def tutor_answer(learner: Learner, question: str, lm: dspy.LM) -> dict:
    context = LearnerContext(
        country=COUNTRY, language=LANGUAGE, gradeLevel=learner.grade_level
    )
    turn_lm = lm.copy()
    with dspy.context(lm=turn_lm):
        async for item in Tutor(InMemoryConversationStore()).stream(
            "measure", question, context
        ):
            if isinstance(item, TutorReply):
                reply = item
    shown = persona(turn_lm)
    return {
        "answer": reply.answer,
        "persona": shown,
        "persona_names_stage": bool(learner.school) and learner.school in shown,
    }


async def draw(learner: Learner, lm: dspy.LM, number: int) -> dict:
    record: dict = {"learner": learner.name, "draw": number, "error": None}
    try:
        with dspy.context(lm=lm.copy()):
            finished = await LessonService().generate_lesson(
                country=COUNTRY,
                language=LANGUAGE,
                subject=learner.subject,
                topic=learner.topic,
                grade_level=learner.grade_level,
            )
        answers = [await tutor_answer(learner, q, lm) for q in QUESTIONS]
    except Exception as error:
        # A failed draw is counted, not fatal.
        logger.exception("Draw %d for %s failed", number, learner.name)
        record["error"] = f"{type(error).__name__}: {error}"
        return record
    record["lesson_complete"] = finished.success
    record["lesson_wire"] = finished.lesson.model_dump(by_alias=True, mode="json")
    record["personas"] = [a["persona"] for a in answers]
    record["persona_names_stage"] = all(a["persona_names_stage"] for a in answers)
    record["texts"] = {
        "lesson": lesson_texts(finished.lesson),
        "tutor": [a["answer"] for a in answers],
    }
    return record


def model(settings: Settings, transport: HttpxTransport | None = None) -> dspy.LM:
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    return build_lm(settings, transport).copy(cache=False)


async def measure(settings: Settings, chosen: list[Learner], draws: int) -> list[dict]:
    lm = model(settings)
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def gated(learner: Learner, number: int) -> dict:
        async with gate:
            return await draw(learner, lm, number)

    return await asyncio.gather(
        *(gated(learner, n) for learner in chosen for n in range(draws))
    )


async def inspect(settings: Settings) -> None:
    sent: list[bytes] = []

    async def keep(request: httpx.Request) -> None:
        sent.append(request.content)

    client = httpx.AsyncClient(event_hooks={"request": [keep]})
    lm = model(settings, HttpxTransport(client))
    learner = learners()[0]
    reply = await tutor_answer(learner, QUESTIONS[0], lm)
    body = json.loads(sent[0])
    print("== request body of the first call (headers left out) ==")
    print(json.dumps({k: v for k, v in body.items() if k != "messages"}, indent=1))
    for message in body["messages"]:
        print(f"--- {message['role']} ---\n{message['content']}")
    print("== the answer the learner reads ==\n" + reply["answer"])


def _load(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", type=Path, default=None)
    parser.add_argument("--draws", type=int, default=3)
    parser.add_argument("--out", type=Path, default=Path("stage_writing.json"))
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--compare", type=Path, nargs="+")
    parser.add_argument(
        "--learner",
        action="append",
        choices=[name for name, *_ in LEARNERS],
        help="Draw only these learners; every one when left out.",
    )
    return parser.parse_args()


async def main() -> None:
    options = arguments()
    chosen = [
        learner
        for learner in learners()
        if not options.learner or learner.name in options.learner
    ]
    if options.compare:
        report(options.compare, chosen, _load)
        return
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    if options.inspect:
        await inspect(settings)
        return
    records = await measure(settings, chosen, options.draws)
    options.out.write_text(json.dumps(records, indent=1, ensure_ascii=False))
    report([options.out], chosen, _load)


if __name__ == "__main__":
    asyncio.run(main())
