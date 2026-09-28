"""Each slide's check and the practice question marked in code before a
learner sees them, where the answer can be worked out (answers/).

A wrong key is moved to the one right option, and extra right options are
taken out. A check code cannot repair, with no right option or with too
many, is written again once, told why. One still wrong after that is taken
out: a slide without its check, or a lesson without its practice question,
teaches nothing wrong, where a wrong key tells the learner a wrong answer is
right.

Each repair is logged, with no learner data, so repairs can be counted."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from functools import partial

from .answers.repair import FEWEST_ALLOWED, Check, problem, repaired
from .answers.verdict import Found, Verdict, verdict
from .lesson import LessonPractice, LessonSlide

logger = logging.getLogger(__name__)


class Outcome(StrEnum):
    KEPT = "kept"
    REKEYED = "rekeyed"
    TRIMMED = "trimmed"
    REWRITTEN = "rewritten"
    DROPPED = "dropped"


_REPAIRED = {Found.WRONG_KEY: Outcome.REKEYED, Found.DOUBLE_RIGHT: Outcome.TRIMMED}


@dataclass(frozen=True)
class CheckReport:
    where: str
    found: Found
    outcome: Outcome
    worked: str | None
    before: Check
    after: Check | None
    asked_again: bool = False
    # The verdict on the check written again, when it came back.
    rewrite_found: Found | None = None


@dataclass(frozen=True)
class Checks[Part]:
    """How to read a part's check, and to give it a repaired one or none."""

    read: Callable[[Part], Check]
    write: Callable[[Part, Check | None], Part | None]


def _judged(check: Check) -> Verdict:
    return verdict(check.question, check.options, check.answer_index)


def _log(report: CheckReport) -> None:
    level = logging.DEBUG if report.outcome is Outcome.KEPT else logging.WARNING
    logger.log(
        level,
        "Answer check on %s: %s, %s",
        report.where,
        report.found,
        report.outcome,
        extra={"answer_check": report},
    )


async def checked[Part](
    part: Part,
    checks: Checks[Part],
    rewrite: Callable[[str], Awaitable[Part]],
    where: str,
) -> Part | None:
    """The part with its check repaired, written again, or taken out."""
    before = checks.read(part)
    found = _judged(before)
    report = partial(
        CheckReport,
        where,
        found.found,
        worked=found.asked.worked.value if found.asked else None,
        before=before,
    )
    fixed = repaired(before, found)
    if fixed is None:
        return await _written_again(part, checks, rewrite, found, report)
    _log(report(outcome=_REPAIRED.get(found.found, Outcome.KEPT), after=fixed))
    return checks.write(part, fixed)


async def _written_again[Part](
    part: Part,
    checks: Checks[Part],
    rewrite: Callable[[str], Awaitable[Part]],
    found: Verdict,
    report: Callable[..., CheckReport],
) -> Part | None:
    """Written again once, told why; failing that, the first check trimmed
    to two options when that makes it right, or taken out."""
    before = checks.read(part)
    try:
        again = await rewrite(problem(before, found))
    except Exception:
        logger.warning("A check was not written again", exc_info=True)
        again = None
    second = _judged(checks.read(again)) if again is not None else None
    fixed = repaired(checks.read(again), second) if second else None
    reported = partial(
        report, asked_again=True, rewrite_found=second.found if second else None
    )
    if fixed is not None:
        _log(reported(outcome=Outcome.REWRITTEN, after=fixed))
        return checks.write(again, fixed)
    fallback = repaired(before, found, fewest=FEWEST_ALLOWED)
    _log(
        reported(
            outcome=Outcome.TRIMMED if fallback else Outcome.DROPPED, after=fallback
        )
    )
    return checks.write(part, fallback)


def _slide_check(slide: LessonSlide) -> Check:
    check = slide.assessment
    return Check(
        check.prompt,
        check.options,
        check.answer_index,
        check.correct_feedback,
        check.incorrect_feedback,
    )


def _slide_with(slide: LessonSlide, check: Check | None) -> LessonSlide:
    if check is None:
        return slide.model_copy(update={"assessment": None})
    assessment = slide.assessment.model_copy(
        update={
            "options": check.options,
            "answer_index": check.answer_index,
            "correct_feedback": check.correct_feedback,
            "incorrect_feedback": check.incorrect_feedback,
        }
    )
    return slide.model_copy(update={"assessment": assessment})


def _practice_check(practice: LessonPractice) -> Check:
    return Check(
        practice.question,
        practice.options,
        practice.answer_index,
        practice.correct_feedback,
        practice.incorrect_feedback,
    )


def _practice_with(
    practice: LessonPractice, check: Check | None
) -> LessonPractice | None:
    if check is None:
        return None
    return practice.model_copy(
        update={
            "options": check.options,
            "answer_index": check.answer_index,
            "correct_feedback": check.correct_feedback,
            "incorrect_feedback": check.incorrect_feedback,
        }
    )


SLIDE_CHECKS = Checks(_slide_check, _slide_with)
PRACTICE_CHECKS = Checks(_practice_check, _practice_with)
