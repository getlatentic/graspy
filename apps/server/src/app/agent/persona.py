"""Who the tutor is to the learner: a tutor for their own stage of schooling,
writing as that stage needs. A learner whose class the catalogue cannot
place meets the tutor it has always been, WITHOUT_STAGE."""

from __future__ import annotations

from ..config.stage_writing import WRITING
from ..education.stage import LearnerStage

WITHOUT_STAGE = """You are graspy, a study assistant for secondary school learners who may
be studying alone."""


def persona(learner: LearnerStage) -> str:
    writing = WRITING[learner.stage]
    guidance = writing.guidance() if writing.tutor_follows_guidance else ""
    rules = f"{guidance} {writing.tutor_answer}".strip()
    return (
        f"You are graspy, a tutor for {writing.school} learners who may be "
        f"studying alone. This learner is in {learner.described()}. Write "
        f"every answer, practice question and passage for them: {rules}"
    )
