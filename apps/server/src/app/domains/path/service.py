"""A learning path: the topics between what a learner can study now and a
goal they name, each at its own level."""

from __future__ import annotations

import logging

import dspy

from ...config.languages import generation_language_for, needs_translation
from ..curriculum.prompts import TranslateCurriculumTopics
from .prompts import PlanLearningPath

logger = logging.getLogger(__name__)

# One lesson per step: a dozen reaches university mathematics from secondary
# school; more reads as a syllabus nobody will finish.
MAX_STEPS = 12


class LearningPathService:
    def __init__(self) -> None:
        self.plan = dspy.ChainOfThought(PlanLearningPath)
        self.translate = dspy.ChainOfThought(TranslateCurriculumTopics)

    async def plan_path(
        self, country: str, language: str, grade_level: str, goal: str
    ) -> dict:
        prediction = await self.plan.acall(
            country=country,
            language=generation_language_for(language),
            grade_level=grade_level,
            goal=goal,
        )
        steps = _unique_steps(prediction.steps)
        if not steps:
            raise ValueError(f"No steps were planned towards {goal!r}")
        name = prediction.subject_name.strip() or goal
        titles = [step.title for step in steps]
        if needs_translation(language):
            name, titles = await self._translated(name, titles, language)
        return {
            "subject": name,
            "goal": goal,
            "steps": [
                {"title": title, "level": step.level.strip()}
                for title, step in zip(titles, steps)
            ],
        }

    async def _translated(
        self, name: str, titles: list[str], language: str
    ) -> tuple[str, list[str]]:
        """Unchanged when the translation comes back a different length and
        could pair wrongly."""
        prediction = await self.translate.acall(
            topics=[name, *titles], subject=name, target_language=language
        )
        translated = prediction.translated_topics
        if len(translated) != len(titles) + 1:
            logger.warning(
                "Path translation returned %d items for %d; kept the original",
                len(translated),
                len(titles) + 1,
            )
            return name, titles
        return translated[0], translated[1:]


def _unique_steps(steps: list) -> list:
    seen: set[str] = set()
    kept = []
    for step in steps or []:
        title = " ".join(step.title.split())
        if title and title.casefold() not in seen:
            seen.add(title.casefold())
            step.title = title
            kept.append(step)
    return kept[:MAX_STEPS]
