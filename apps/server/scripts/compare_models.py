"""Compare candidate models on the work graspy actually does.

Runs the real lesson pipeline and the real tutor in-process under each model,
then scores what came out:

    lessons  complete (every planned slide, nothing left untranslated), slides
             delivered, seconds, English left in a non-English lesson, and
             answer validity: a judge model answers each quiz question without
             seeing the marked answer, and must agree with it.
    tutor    correct (judged), replied in the learner's language (measured),
             tool calls, seconds.
    navigation  asked to go to a topic, whether the right one opened.

The judge is a third model so neither candidate grades itself, and not a
Claude model. Every id is one Bedrock serves on bedrock-mantle in AWS_REGION.

    uv run python scripts/compare_models.py \\
        --models openai.gpt-oss-120b openai.gpt-oss-20b --runs 2

Results go to stdout as a table and to --out as JSON, one record per case.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import statistics
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import dspy
from dspy.utils.callback import BaseCallback

from app.agent.context import LearnerContext
from app.agent.memory import InMemoryConversationStore
from app.agent.tutor import Tutor, TutorReply
from app.domains.lesson.lesson import FinishedLesson
from app.domains.lesson.service import LessonRequest, LessonService
from app.llm.client import build_lm
from app.settings import get_settings

logger = logging.getLogger("compare_models")

COUNTRY = "Nigeria"
GRADE = "JSS 1"
LESSONS = [
    ("Mathematics", "Fractions"),
    ("Basic Science", "Living and Non-living Things"),
    ("English Studies", "Parts of Speech"),
]
LANGUAGES = ["English", "Yoruba"]

# (language, subject, topic, question, expected answer or None for a judged one)
TUTOR_CASES = [
    ("English", "Mathematics", "Percentages", "What is 17% of 240?", "40.8"),
    ("Yoruba", "Mathematics", "Division", "Kí ni 144 pín sí 12?", "12"),
    (
        "English",
        "Mathematics",
        "Profit and Loss",
        "A trader buys 3 crates of tomatoes at ₦4,500 each and sells them for ₦16,200 in total. What is her profit?",
        "₦2,700",
    ),
    (
        "English",
        "English Studies",
        "Parts of Speech",
        "What is the difference between a noun and a verb? Give an example of each.",
        None,
    ),
]

MATHS_TOPICS = [
    "Number Systems",
    "Addition and Subtraction",
    "Fractions and Decimals",
    "Times Tables",
]
# (language, request, the topic that must open)
NAVIGATION_CASES = [
    ("English", "Take me to the fractions lesson.", "Fractions and Decimals"),
    ("Yoruba", "Mú mi lọ sí ẹ̀kọ́ ìdá (fractions).", "Fractions and Decimals"),
]

# Common English words that are not also common Yoruba words. "a" is both, and
# counting it would score a Yoruba reply as English.
ENGLISH_WORDS = {
    "the",
    "and",
    "is",
    "of",
    "to",
    "in",
    "that",
    "it",
    "for",
    "are",
    "with",
    "this",
    "we",
}
# English prose runs near 0.2 on these words; a Yoruba reply stays under 0.03.
ENGLISH_REPLY_SHARE = 0.08
CASE_TIMEOUT_SECONDS = 420


class SolveQuestion(dspy.Signature):
    """Answer a multiple-choice question from a school lesson. Choose the one
    correct option."""

    question: str = dspy.InputField()
    options: list[str] = dspy.InputField()
    # The option's text rather than its position: judges disagree on whether
    # positions count from 0 or 1.
    answer: str = dspy.OutputField(desc="The correct option, copied exactly")


class JudgeTutorReply(dspy.Signature):
    """Judge a tutor's reply to a secondary school learner."""

    question: str = dspy.InputField()
    reply: str = dspy.InputField()
    expected_answer: str = dspy.InputField(
        desc="The right answer, or 'judge it' when none is given"
    )
    correct: bool = dspy.OutputField(
        desc="The reply's answer is right and its explanation has no error"
    )


class ToolCounter(BaseCallback):
    def __init__(self) -> None:
        self.calls = 0

    def on_tool_start(self, call_id, instance, inputs):
        self.calls += 1


@dataclass
class LessonResult:
    model: str
    subject: str
    topic: str
    language: str
    seconds: float
    planned: int = 0
    delivered: int = 0
    complete: bool = False
    warnings: list[str] = field(default_factory=list)
    english_share: float | None = None
    questions: int = 0
    answers_valid: int = 0
    unjudged: int = 0
    disagreements: list[dict] = field(default_factory=list)
    error: str | None = None


@dataclass
class NavigationResult:
    model: str
    language: str
    request: str
    seconds: float
    opened: str | None = None
    right: bool = False
    error: str | None = None


@dataclass
class TutorResult:
    model: str
    language: str
    question: str
    seconds: float
    reply: str = ""
    follow_ups: int = 0
    tool_calls: int = 0
    correct: bool = False
    same_language: bool = False
    error: str | None = None


def lm_for(model_id: str) -> dspy.LM:
    return build_lm(get_settings().model_copy(update={"llm_model_id": model_id}))


async def replied(message: str, learner: LearnerContext) -> TutorReply:
    """The finished reply to one message, in a conversation of its own."""
    async for item in Tutor(InMemoryConversationStore()).stream(
        "eval", message, learner
    ):
        if isinstance(item, TutorReply):
            return item
    raise RuntimeError("The tutor turn ended without a reply")


def english_share(texts: list[str]) -> float:
    words = re.findall(r"[a-zA-Z]+", " ".join(texts).lower())
    return round(sum(w in ENGLISH_WORDS for w in words) / max(len(words), 1), 3)


def replies_in(language: str, reply: str) -> bool:
    """Measured, not judged: the judge models the account can reach do not
    read Yoruba reliably, and the share of common English words separates
    the two languages cleanly."""
    english = english_share([reply]) >= ENGLISH_REPLY_SHARE
    return english if language == "English" else not english


def choice_questions(finished: FinishedLesson) -> list[dict]:
    lesson = finished.lesson
    found = [
        (
            slide.assessment.prompt,
            slide.assessment.options,
            slide.assessment.answer_index,
        )
        for slide in lesson.slides
    ]
    if lesson.practice:
        practice = lesson.practice
        found.append((practice.question, practice.options, practice.answer_index))
    return [
        {"question": question, "options": options, "answer": answer}
        for question, options, answer in found
        if question
    ]


def comparable_option(text: str) -> str:
    """An option as a judge might copy it back: judges wrap answers in quotes
    or bold, which an exact match would read as disagreement."""
    # A judge answering in JSON can also double every backslash in LaTeX.
    stripped = text.replace("\\\\", "\\").strip().strip("\"'“”‘’`").strip()
    return re.sub(r"\*\*|__", "", stripped).rstrip(".!").strip().casefold()


def option_index(answer: str, options: list[str]) -> int | None:
    wanted = comparable_option(answer)
    matches = [
        index
        for index, option in enumerate(options)
        if comparable_option(option) == wanted
    ]
    return matches[0] if len(matches) == 1 else None


async def check_answers(
    questions: list[dict], judge: dspy.LM, disagreements: list[dict]
) -> tuple[int, int]:
    """(agreed, unjudged), each disagreement added to ``disagreements`` so a
    reader can tell a wrong answer key from a wrong judge. A judge call that
    fails is counted apart, or an unreachable judge would read as a wrong
    lesson."""
    solver = dspy.Predict(SolveQuestion)
    agreed = unjudged = 0
    with dspy.context(lm=judge):
        for q in questions:
            try:
                picked = await solver.acall(
                    question=q["question"], options=q["options"]
                )
            except Exception:
                logger.debug("Judge could not answer %r", q["question"], exc_info=True)
                unjudged += 1
                continue
            if option_index(picked.answer, q["options"]) == q["answer"]:
                agreed += 1
            else:
                disagreements.append({**q, "judge": picked.answer})
    return agreed, unjudged


async def run_lesson(
    model: str, subject: str, topic: str, language: str, judge: dspy.LM
) -> LessonResult:
    started = time.perf_counter()
    result = LessonResult(model, subject, topic, language, 0.0)
    try:
        with dspy.context(lm=lm_for(model)):
            async for event in LessonService().events(
                LessonRequest(COUNTRY, language, subject, topic, GRADE)
            ):
                if event["type"] == "plan":
                    result.planned = len(event["payload"].slide_specs)
                elif event["type"] == "slide":
                    result.delivered += 1
                elif event["type"] == "warning":
                    result.warnings.append(event["message"])
                elif event["type"] == "complete":
                    finished = event["payload"]
        result.seconds = round(time.perf_counter() - started, 1)
        result.complete = finished.success
        if language != "English":
            result.english_share = english_share(
                [slide.body_md for slide in finished.lesson.slides]
            )
        questions = choice_questions(finished)
        result.questions = len(questions)
        result.answers_valid, result.unjudged = await check_answers(
            questions, judge, result.disagreements
        )
    except Exception as exc:
        logger.debug(
            "Lesson %s/%s in %s failed under %s",
            subject,
            topic,
            language,
            model,
            exc_info=True,
        )
        result.seconds = round(time.perf_counter() - started, 1)
        result.error = f"{type(exc).__name__}: {exc}"[:300]
    return result


async def run_tutor(model: str, case: tuple, judge: dspy.LM) -> TutorResult:
    language, subject, topic, question, expected = case
    result = TutorResult(model, language, question, 0.0)
    learner = LearnerContext(
        country=COUNTRY,
        language=language,
        gradeLevel=GRADE,
        subject=subject,
        topic=topic,
    )
    counter = ToolCounter()
    started = time.perf_counter()
    try:
        with dspy.context(lm=lm_for(model), callbacks=[counter]):
            reply = await replied(question, learner)
        result.reply, result.follow_ups = reply.answer, len(reply.follow_ups)
        result.seconds = round(time.perf_counter() - started, 1)
        result.tool_calls = counter.calls
        with dspy.context(lm=judge):
            verdict = await dspy.Predict(JudgeTutorReply).acall(
                question=question,
                reply=result.reply,
                expected_answer=expected or "judge it",
            )
        result.correct = bool(verdict.correct)
        result.same_language = replies_in(language, result.reply)
    except Exception as exc:
        logger.debug("Tutor turn %r failed under %s", question, model, exc_info=True)
        result.seconds = round(time.perf_counter() - started, 1)
        result.error = f"{type(exc).__name__}: {exc}"[:300]
    return result


async def run_navigation(model: str, case: tuple) -> NavigationResult:
    language, request, expected = case
    result = NavigationResult(model, language, request, 0.0)
    learner = LearnerContext(
        country=COUNTRY,
        language=language,
        gradeLevel=GRADE,
        subject="Mathematics",
        subjectSlug="mathematics",
        topic=MATHS_TOPICS[0],
        topics=MATHS_TOPICS,
    )
    started = time.perf_counter()
    try:
        with dspy.context(lm=lm_for(model)):
            reply = await replied(request, learner)
        result.opened = getattr(next(iter(reply.actions), None), "topic", None)
        result.right = result.opened == expected
    except Exception as exc:
        logger.debug("Navigation %r failed under %s", request, model, exc_info=True)
        result.error = f"{type(exc).__name__}: {exc}"[:300]
    result.seconds = round(time.perf_counter() - started, 1)
    return result


async def bounded(limit: asyncio.Semaphore, coroutine):
    async with limit:
        try:
            return await asyncio.wait_for(coroutine, CASE_TIMEOUT_SECONDS)
        except TimeoutError:
            return None


def rate(values: list[bool]) -> str:
    return f"{sum(values)}/{len(values)}" if values else "-"


def errors(results: list) -> str:
    failed = sum(bool(result.error) for result in results)
    return f" errors {failed}" if failed else ""


def lesson_row(runs: list[LessonResult]) -> str:
    leaks = [r.english_share for r in runs if r.english_share is not None]
    judged = sum(r.questions - r.unjudged for r in runs)
    return (
        f"  lessons {runs[0].language:8s} complete {rate([r.complete for r in runs]):6s}"
        f" slides {sum(r.delivered for r in runs)}/{sum(r.planned for r in runs):<4d}"
        f" answers valid {sum(r.answers_valid for r in runs)}/{judged:<4d}"
        f" median {statistics.median(r.seconds for r in runs):5.1f}s"
        + (f" english share {statistics.mean(leaks):.2f}" if leaks else "")
        + errors(runs)
    )


def tutor_row(turns: list[TutorResult]) -> str:
    return (
        f"  tutor            correct {rate([t.correct for t in turns]):6s}"
        f" same language {rate([t.same_language for t in turns]):6s}"
        f" tool calls {sum(t.tool_calls for t in turns)}"
        f" median {statistics.median(t.seconds for t in turns):5.1f}s" + errors(turns)
    )


def navigation_row(moves: list[NavigationResult]) -> str:
    return f"  opens topics     right {rate([n.right for n in moves]):6s}" + "".join(
        f"  [{n.language}: {n.opened or n.error or 'nothing'}]" for n in moves
    )


ROWS = {
    LessonResult: lesson_row,
    TutorResult: tutor_row,
    NavigationResult: navigation_row,
}


def of_kind(results: list, kind: type) -> list:
    return [result for result in results if isinstance(result, kind)]


def summarize(results: list) -> list[str]:
    """One model's results as table rows: its lessons in each language, then
    its tutor turns and navigation."""
    lessons = of_kind(results, LessonResult)
    groups = [[r for r in lessons if r.language == language] for language in LANGUAGES]
    groups += [of_kind(results, TutorResult), of_kind(results, NavigationResult)]
    return [ROWS[type(group[0])](group) for group in groups if group]


def lesson_jobs(models: list[str], runs: int, judge: dspy.LM) -> list:
    return [
        run_lesson(model, subject, topic, language, judge)
        for model in models
        for subject, topic in LESSONS
        for language in LANGUAGES
        for _ in range(runs)
    ]


def jobs(models: list[str], runs: int, judge: dspy.LM, only: str | None) -> list:
    """Every case to run: lessons, tutor turns and navigation, or one part."""
    lessons = [] if only == "tutor" else lesson_jobs(models, runs, judge)
    if only == "lessons":
        return lessons
    turns = [run_tutor(model, case, judge) for model in models for case in TUTOR_CASES]
    turns += [
        run_navigation(model, case) for model in models for case in NAVIGATION_CASES
    ]
    return [*lessons, *turns]


async def main(
    models: list[str],
    runs: int,
    judge_model: str,
    concurrency: int,
    out: Path,
    only: str | None,
) -> None:
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    judge = lm_for(judge_model)
    limit = asyncio.Semaphore(concurrency)
    finished = await asyncio.gather(
        *(bounded(limit, job) for job in jobs(models, runs, judge, only))
    )
    results = [r for r in finished if r is not None]
    out.write_text(
        json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=2)
    )
    print(
        f"judge: {judge_model}   runs per lesson: {runs}   "
        f"timed out: {len(finished) - len(results)}   details: {out}"
    )
    for model in models:
        print(model)
        print("\n".join(summarize([r for r in results if r.model == model])))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--models", nargs="+", default=["openai.gpt-oss-120b", "openai.gpt-oss-20b"]
    )
    parser.add_argument(
        "--runs", type=int, default=2, help="Runs of each lesson case per model"
    )
    parser.add_argument("--judge", default="deepseek.v3.2")
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--out", type=Path, default=Path("model-comparison.json"))
    parser.add_argument(
        "--verbose", action="store_true", help="Print each failure's traceback"
    )
    parser.add_argument(
        "--only", choices=["lessons", "tutor"], help="Run one part only"
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.WARNING)
    logger.setLevel(logging.DEBUG if args.verbose else logging.WARNING)
    asyncio.run(
        main(args.models, args.runs, args.judge, args.concurrency, args.out, args.only)
    )
