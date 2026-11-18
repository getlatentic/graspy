"""Each slide's check and the practice question marked in code before a
learner sees them, where the answer can be worked out (answers/).

A wrong key is moved to the one right option, and extra right options are
taken out. A check code cannot repair, with no right option or with too
many, or whose feedback contradicts its key, is written again, told why: once
for a slide, twice for the practice question. One still wrong after that is
taken out: a slide without its check teaches nothing wrong, where a wrong key
tells the learner a wrong answer is right. A lesson whose practice question is
taken out ends with its last checked slide question instead (practice_from).

Each repair is logged, with no learner data, so repairs can be counted."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from functools import partial

from .answers.contradiction import contradiction
from .answers.repair import FEWEST_ALLOWED, FEWEST_OPTIONS, Check, problem, repaired
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


def _judgement(
    check: Check, fewest: int = FEWEST_OPTIONS
) -> tuple[Verdict, Check | None]:
    """What the check is found to be, and the check as a learner may see it:
    repaired where code can repair it, and None when it must be written again,
    as when its feedback contradicts its key."""
    found = _judged(check)
    fixed = repaired(check, found, fewest)
    reason = contradiction(fixed) if fixed else None
    if reason:
        return Verdict(Found.CONTRADICTED, found.asked, reason=reason), None
    return found, fixed


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
    rewrites: int = 1,
) -> Part | None:
    """The part with its check repaired, written again (up to ``rewrites``
    times, each told what was wrong), or taken out."""
    before = checks.read(part)
    found, fixed = _judgement(before)
    report = partial(
        CheckReport,
        where,
        found.found,
        worked=found.asked.worked.value if found.asked else None,
        before=before,
    )
    if fixed is None:
        return await _written_again(part, checks, rewrite, found, report, rewrites)
    _log(report(outcome=_REPAIRED.get(found.found, Outcome.KEPT), after=fixed))
    return checks.write(part, fixed)


async def _written_again[Part](
    part: Part,
    checks: Checks[Part],
    rewrite: Callable[[str], Awaitable[Part]],
    found: Verdict,
    report: Callable[..., CheckReport],
    rewrites: int,
) -> Part | None:
    """Written again, told why each time; failing that, the first check
    trimmed to two options when that makes it right, or taken out."""
    before = checks.read(part)
    told, second = problem(before, found), None
    for _ in range(rewrites):
        try:
            again = await rewrite(told)
        except Exception:
            logger.warning("A check was not written again", exc_info=True)
            break
        second, fixed = _judgement(checks.read(again))
        if fixed is not None:
            _log(
                report(
                    asked_again=True,
                    rewrite_found=second.found,
                    outcome=Outcome.REWRITTEN,
                    after=fixed,
                )
            )
            return checks.write(again, fixed)
        told = problem(checks.read(again), second)
    fallback = _judgement(before, FEWEST_ALLOWED)[1]
    _log(
        report(
            asked_again=True,
            rewrite_found=second.found if second else None,
            outcome=Outcome.TRIMMED if fallback else Outcome.DROPPED,
            after=fallback,
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


# The practice question is the lesson's last question and must not be missing,
# so it is written again once more than a slide's check.
PRACTICE_REWRITES = 2


def practice_from(slides: list[LessonSlide]) -> LessonPractice | None:
    """The last slide question that survived checking, as the practice
    question, for a lesson whose own practice question could not be made
    right; None when no slide kept one."""
    for slide in reversed(slides):
        if (check := slide.assessment) is not None:
            return LessonPractice(
                question=check.prompt,
                options=check.options,
                answer_index=check.answer_index,
                correct_feedback=check.correct_feedback,
                incorrect_feedback=check.incorrect_feedback,
            )
    return None


SLIDE_CHECKS = Checks(_slide_check, _slide_with)
PRACTICE_CHECKS = Checks(_practice_check, _practice_with)
