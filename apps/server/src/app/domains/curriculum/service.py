from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import dspy

from ...config.languages import generation_language_for, needs_translation
from ...utils.slug import slugify
from .prompts import (
    CurriculumSubjectInput,
    GenerateCurriculum,
    GenerateCurriculumTopics,
    TranslateCurriculumTopics,
)

logger = logging.getLogger(__name__)

Subjects = list[dict[str, str]]
Topics = dict[str, list[str]]


class CurriculumService:
    def __init__(self):
        self.write_curriculum = dspy.ChainOfThought(GenerateCurriculum)
        self.write_topics = dspy.ChainOfThought(GenerateCurriculumTopics)
        self.translate_topics = dspy.ChainOfThought(TranslateCurriculumTopics)

    async def generate(
        self,
        country: str,
        language: str,
        grade_level: str,
        subjects: list[str] | None = None,
    ) -> dict:
        chosen = normalize_subjects(subjects or [])
        writing_language = generation_language_for(language)
        if chosen:
            listed, topics = await self._topics_for(
                chosen, country, writing_language, grade_level
            )
        else:
            listed, topics = await self._whole_curriculum(
                country, writing_language, grade_level
            )
        if needs_translation(language):
            names = {subject["slug"]: subject["name"] for subject in listed}
            topics = {
                slug: await self._translate(items, names[slug], language)
                for slug, items in topics.items()
            }
        return {
            "subjects": listed,
            "topics": {
                slug: list(dict.fromkeys(items)) for slug, items in topics.items()
            },
        }

    async def generate_stream(
        self,
        country: str,
        language: str,
        grade_level: str,
        subjects: list[str] | None = None,
    ) -> AsyncIterator[str]:
        yield json.dumps({"type": "status", "message": "Designing curriculum..."})
        result = await self.generate(country, language, grade_level, subjects or [])
        yield json.dumps(
            {
                "type": "result",
                "subjects": result["subjects"],
                "topics": result["topics"],
            }
        )

    async def _topics_for(
        self,
        chosen: list[CurriculumSubjectInput],
        country: str,
        language: str,
        grade_level: str,
    ) -> tuple[Subjects, Topics]:
        prediction = await self.write_topics.acall(
            country=country,
            language=language,
            grade_level=grade_level,
            input_subjects=chosen,
        )
        # The client's slug, not the model's key: progress is stored under it.
        listed = [
            {"name": subject.label, "slug": slugify(subject.id)} for subject in chosen
        ]
        return listed, pair_topics(chosen, prediction.topics)

    async def _whole_curriculum(
        self, country: str, language: str, grade_level: str
    ) -> tuple[Subjects, Topics]:
        prediction = await self.write_curriculum.acall(
            country=country,
            language=language,
            grade_level=grade_level,
            input_subjects=[],
        )
        listed: Subjects = []
        topics: Topics = {}
        for item in prediction.curriculum:
            slug = slugify(item.subject_slug)
            if any(subject["slug"] == slug for subject in listed):
                continue
            listed.append({"name": item.subject_label, "slug": slug})
            if item.topics:
                topics[slug] = item.topics
        return listed, topics

    async def _translate(
        self, items: list[str], subject: str, language: str
    ) -> list[str]:
        if not items:
            return items
        prediction = await self.translate_topics.acall(
            topics=items, subject=subject, target_language=language
        )
        logger.debug(
            "Translated %d topics for %s into %s", len(items), subject, language
        )
        return prediction.translated_topics


def normalize_subjects(subjects: list[str]) -> list[CurriculumSubjectInput]:
    """Each "label|id", or a bare name used as both; a subject whose id
    slugifies like an earlier one is dropped."""
    unique: dict[str, CurriculumSubjectInput] = {}
    for subject in map(_as_subject_input, subjects):
        unique.setdefault(slugify(subject.id), subject)
    return list(unique.values())


def pair_topics(
    chosen: list[CurriculumSubjectInput], generated: dict[str, list[str]]
) -> Topics:
    """The generated topics by each chosen subject's slug. The model keys
    them by id, by label, or by a translated name. Keys that match no subject
    pair by position with the unmatched subjects only when the counts are
    equal; otherwise they are dropped."""
    remaining = {slugify(key): items for key, items in generated.items()}
    slugs = [slugify(subject.id) for subject in chosen]
    paired = _paired_by_name(chosen, slugs, remaining)
    paired |= _paired_by_position([s for s in slugs if s not in paired], remaining)
    return {slug: paired[slug] for slug in slugs if slug in paired}


def _paired_by_name(
    chosen: list[CurriculumSubjectInput], slugs: list[str], remaining: Topics
) -> Topics:
    """Taken out of ``remaining``. Every id is tried before any label, so a
    label cannot claim another subject's key."""
    paired: Topics = {}
    for names in (slugs, [slugify(subject.label) for subject in chosen]):
        for slug, name in zip(slugs, names):
            if slug not in paired and name in remaining:
                paired[slug] = remaining.pop(name)
    return paired


def _paired_by_position(unmatched: list[str], remaining: Topics) -> Topics:
    if len(unmatched) == len(remaining):
        return dict(zip(unmatched, remaining.values()))
    if remaining:
        logger.warning(
            "Dropped topics under %d key(s) that match no chosen subject",
            len(remaining),
        )
    return {}


def _as_subject_input(subject: str) -> CurriculumSubjectInput:
    parts = subject.split("|")
    if len(parts) > 1:
        return CurriculumSubjectInput(id=parts[1].strip(), label=parts[0].strip())
    return CurriculumSubjectInput(id=subject, label=subject)
