from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Iterable

import dspy

from ...config.languages import generation_language_for, needs_translation
from ...utils.slug import slugify
from .packages import Course, held_course
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
        system: str | None = None,
        level: str | None = None,
    ) -> dict:
        """The plan's subjects and topics. A subject a held curriculum covers for this class takes that curriculum's
        topics, in its order, and its source is returned; the rest are written by the model."""
        chosen = normalize_subjects(subjects or [])
        writing_language = generation_language_for(language)
        if chosen:
            held = _first_for_each(
                (slugify(s.id), _held(system, level, s)) for s in chosen
            )
            listed = [{"name": s.label, "slug": slugify(s.id)} for s in chosen]
            to_write = [s for s in chosen if slugify(s.id) not in held]
            topics = (
                await self._topics_for(to_write, country, writing_language, grade_level)
                if to_write
                else {}
            )
        else:
            listed, topics = await self._whole_curriculum(
                country, writing_language, grade_level
            )
            held = _first_for_each(
                (
                    s["slug"],
                    held_course(system, level, s["name"])
                    or held_course(system, level, s["slug"]),
                )
                for s in listed
            )
        topics |= {slug: course.topics() for slug, course in held.items()}
        _record_unheld(
            country, system, level, [s["slug"] for s in listed if s["slug"] not in held]
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
            "sources": {slug: course.source.as_json() for slug, course in held.items()},
        }

    async def generate_stream(
        self,
        country: str,
        language: str,
        grade_level: str,
        subjects: list[str] | None = None,
        system: str | None = None,
        level: str | None = None,
    ) -> AsyncIterator[str]:
        yield json.dumps({"type": "status", "message": "Designing curriculum..."})
        result = await self.generate(
            country, language, grade_level, subjects or [], system, level
        )
        yield json.dumps({"type": "result", **result})

    async def _topics_for(
        self,
        chosen: list[CurriculumSubjectInput],
        country: str,
        language: str,
        grade_level: str,
    ) -> Topics:
        prediction = await self.write_topics.acall(
            country=country,
            language=language,
            grade_level=grade_level,
            input_subjects=chosen,
        )
        return pair_topics(chosen, prediction.topics)

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


def _held(
    system: str | None, level: str | None, subject: CurriculumSubjectInput
) -> Course | None:
    return held_course(system, level, subject.id) or held_course(
        system, level, subject.label
    )


def _first_for_each(matches: Iterable[tuple[str, Course | None]]) -> dict[str, Course]:
    """Each held course for the first subject it matches: a plan listing "Mathematics" and "General Mathematics" does
    not show one curriculum twice."""
    held: dict[str, Course] = {}
    for slug, course in matches:
        if course is not None and course not in held.values():
            held[slug] = course
    return held


def _record_unheld(
    country: str, system: str | None, level: str | None, subjects: list[str]
) -> None:
    """Which classes and subjects learners ask for that graspy holds no curriculum for: the order to source them in."""
    for subject in subjects:
        logger.info(
            json.dumps(
                {
                    "part": "curriculum-unheld",
                    "country": country,
                    "system": system,
                    "level": level,
                    "subject": subject,
                }
            )
        )


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
