"""Lessons the server made, kept by id for the tutor to read."""

from __future__ import annotations

import logging
from typing import Any, Protocol

from pydantic import ValidationError

from ..domains.lesson.lesson import Lesson

logger = logging.getLogger(__name__)

KEEP_DAYS = 180
MEMORY_LESSONS = 500


class LessonStore(Protocol):
    async def keep(self, lesson_id: str, lesson: Lesson) -> None: ...

    async def find(self, lesson_id: str) -> Lesson | None: ...


class InMemoryLessonStore:
    def __init__(self) -> None:
        self._lessons: dict[str, Lesson] = {}

    async def keep(self, lesson_id: str, lesson: Lesson) -> None:
        self._lessons[lesson_id] = lesson
        while len(self._lessons) > MEMORY_LESSONS:
            del self._lessons[next(iter(self._lessons))]

    async def find(self, lesson_id: str) -> Lesson | None:
        return self._lessons.get(lesson_id)


class DurableObjectLessonStore:
    def __init__(self, namespace: Any) -> None:
        self._namespace = namespace

    async def keep(self, lesson_id: str, lesson: Lesson) -> None:
        await self._namespace.getByName(lesson_id).keep(
            lesson.model_dump_json(by_alias=True)
        )

    async def find(self, lesson_id: str) -> Lesson | None:
        found = await self._namespace.getByName(lesson_id).find()
        return _read(lesson_id, found) if found else None


def _read(lesson_id: str, found: str) -> Lesson | None:
    try:
        return Lesson.model_validate_json(found)
    except ValidationError:
        logger.warning("Kept lesson %s is malformed", lesson_id)
        return None
