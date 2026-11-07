"""The signature each lesson part is written with, composed from the prompt in prompts.py: the learner's stage when
the catalogue knows it, the held topic's objectives and passages when there is one, and what was wrong with the check
when a part is written again."""

from __future__ import annotations

from functools import cache

import dspy

from .grounded import Part, for_topic
from .prompts import GenerateLessonPlan, GeneratePracticeQuestion, GenerateSlide
from .rewritten import told_the_problem
from .staged import for_stage

BASE: dict[Part, type[dspy.Signature]] = {
    "plan": GenerateLessonPlan,
    "slide": GenerateSlide,
    "practice": GeneratePracticeQuestion,
}


@cache
def signature_for(
    part: Part, *, staged: bool, grounded: bool, rewritten: bool
) -> type[dspy.Signature]:
    signature = BASE[part]
    if staged:
        signature = for_stage(signature)
    if grounded:
        signature = for_topic(signature, part)
    if rewritten:
        signature = told_the_problem(signature)
    return signature
