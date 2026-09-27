"""The lesson prompts for a learner whose stage the catalogue knows: each is
its prompt from prompts.py with the learner's stage, age and how to write for
them as inputs. A learner whose class it cannot place is asked with the
prompts unchanged: measured, even inputs saying "not known" took away two
thirds of a lesson's local examples."""

from __future__ import annotations

import dspy

from ...config.stage_writing import WRITING
from ...education.stage import LearnerStage
from .prompts import GenerateLessonPlan, GeneratePracticeQuestion, GenerateSlide

STAGE_NOTE = (
    "Aim every part at the learner's `stage` and `age`, as `stage_guidance` says."
)
_STAGE_FIELDS = (
    ("stage", "The learner's stage of schooling"),
    ("age", "The learner's age"),
    ("stage_guidance", "How to write for this stage and age"),
)


def for_stage(signature: type[dspy.Signature]) -> type[dspy.Signature]:
    """The signature with the stage's inputs after `grade_level`."""
    at = list(signature.input_fields).index("grade_level") + 1
    for offset, (name, desc) in enumerate(_STAGE_FIELDS):
        signature = signature.insert(at + offset, name, dspy.InputField(desc=desc), str)
    return signature.with_instructions(f"{signature.instructions}\n\n{STAGE_NOTE}")


StagedLessonPlan = for_stage(GenerateLessonPlan)
StagedSlide = for_stage(GenerateSlide)
StagedPracticeQuestion = for_stage(GeneratePracticeQuestion)


def stage_inputs(learner: LearnerStage) -> dict[str, str]:
    return {
        "stage": learner.stage.value,
        "age": learner.age_text(),
        "stage_guidance": WRITING[learner.stage].guidance(),
    }
