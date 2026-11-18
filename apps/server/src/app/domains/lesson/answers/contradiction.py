"""Everything that makes a check contradict itself, in one question: why it
cannot be shown, or None. A check that is right and says so passes."""

from __future__ import annotations

from .feedback import contradiction as feedback_contradiction
from .ill_posed import median_of_names, outlier_claim
from .repair import Check


def contradiction(check: Check) -> str | None:
    return (
        feedback_contradiction(
            check.options,
            check.answer_index,
            check.correct_feedback,
            check.incorrect_feedback,
        )
        or outlier_claim(check.question, check.options, check.answer_index)
        or median_of_names(check.question, check.options, check.answer_index)
    )
