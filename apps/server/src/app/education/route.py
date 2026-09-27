"""How a learner learns: by voice alone, or by slides and voice. One rule, the
catalogue's, which both apps follow: a class whose stage is voice-only, such
as Nigeria's early childhood, has voice lessons and no slide subjects."""

from __future__ import annotations

from functools import cache

from pydantic import Field

from ..wire import Wire
from .catalogue import systems
from .model import Level, System

# The server reads a level of at most 100 characters (the apps' LEVEL_MAX).
LEVEL_MAX = 100


class ClassAsk(Wire):
    """A learner's class as their plan names it: the catalogue's system and
    level, or, for a plan made before plans kept them, only the level the
    server reads."""

    system: str | None = Field(default=None, max_length=12)
    level: str | None = Field(default=None, max_length=100)
    grade_level: str | None = Field(default=None, max_length=300)


def descriptor(system: System, level: Level) -> str:
    """The level the server reads, as the apps write it: "Nursery 1 (Early
    childhood), Nigeria, age 3"."""
    stage = next((s.name.en for s in system.stages if s.id == level.stage), None)
    where = f"{system.name.en}, age {level.age}"
    full = (
        f"{level.name.en} ({stage}), {where}" if stage else f"{level.name.en}, {where}"
    )
    return full if len(full) <= LEVEL_MAX else f"{level.name.en}, {where}"[:LEVEL_MAX]


def _by_ids(ask: ClassAsk) -> tuple[System, Level] | None:
    system = systems().get(ask.system or "")
    level = (
        next((lv for lv in system.levels if lv.id == ask.level), None)
        if system
        else None
    )
    return (system, level) if system and level else None


@cache
def _by_descriptors() -> dict[str, tuple[System, Level]]:
    """The first system wins a name two share, as it did when searched in order."""
    placed: dict[str, tuple[System, Level]] = {}
    for system in systems().values():
        for level in system.levels:
            placed.setdefault(descriptor(system, level), (system, level))
    return placed


def named(grade_level: str) -> tuple[System, Level] | None:
    """The class the apps name in full: "JSS 1 (Junior Secondary School),
    Nigeria, age 12"."""
    return _by_descriptors().get(grade_level)


def voice_only(ask: ClassAsk) -> bool | None:
    """None when the class is not one the catalogue can place."""
    found = _by_ids(ask) or (named(ask.grade_level) if ask.grade_level else None)
    if found is None:
        return None
    system, level = found
    return next(s.voice_only for s in system.stages if s.id == level.stage)
