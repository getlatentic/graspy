"""The catalogue of school systems, one file per system under data/systems.
A file that fails its checks is logged and left out, never served."""

from __future__ import annotations

import logging
from functools import cache
from pathlib import Path

from pydantic import ValidationError

from ..wire import Wire
from .checks import problems
from .generic import generic
from .model import Level, Names, Stage, Status, System

logger = logging.getLogger(__name__)

SYSTEMS = Path(__file__).parent / "data" / "systems"


class LevelView(Level):
    # Its stage's, so an app choosing a class needs no rule of its own.
    voice_only: bool = False


class SystemView(Wire):
    id: str
    country: str
    name: Names
    main: bool
    status: Status
    stages: list[Stage]
    levels: list[LevelView]
    until: int | None = None
    notes: str | None = None


class SystemSummary(Wire):
    id: str
    country: str
    name: Names
    main: bool
    status: Status
    until: int | None = None


def view(system: System) -> SystemView:
    stages = {stage.id: stage for stage in system.stages}
    levels = [
        {**level.model_dump(), "voice_only": stages[level.stage].voice_only}
        for level in system.levels
    ]
    return SystemView.model_validate({**system.model_dump(), "levels": levels})


def checked(path: Path) -> tuple[System | None, list[str]]:
    """The system a file holds, and everything wrong with it."""
    try:
        system = System.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as error:
        return None, [str(error)]
    found = problems(system)
    if system.id != path.stem:
        found.append(f"The file {path.name} holds system {system.id}.")
    return system, found


def _read(path: Path) -> System | None:
    system, found = checked(path)
    if found:
        logger.error("School system %s is left out: %s", path.name, " ".join(found))
        return None
    return system


@cache
def systems() -> dict[str, System]:
    read = (_read(path) for path in sorted(SYSTEMS.glob("*.json")))
    return {system.id: system for system in read if system is not None}


@cache
def countries() -> frozenset[str]:
    """The ISO codes of the countries the catalogue has a school system for."""
    return frozenset(system.country for system in systems().values())


# Where the main system's own name is a part of the country.
COUNTRY_NAMES = {"GB": "United Kingdom"}


def country_name(code: str) -> str:
    """The country's English name as the catalogue writes it, or its code where it has none."""
    return COUNTRY_NAMES.get(code) or of_country(code)[0].name.en


@cache
def _codes_by_name() -> dict[str, str]:
    return {country_name(code).casefold(): code for code in sorted(countries())}


def code_named(name: str) -> str | None:
    """The catalogue country a name or code says, in any case."""
    wanted = " ".join(name.split()).casefold()
    if wanted.upper() in countries():
        return wanted.upper()
    return _codes_by_name().get(wanted)


def of_country(country: str) -> list[System]:
    """Its main one first; numbered grades for a country the catalogue does
    not cover."""
    code = country.upper()
    found = [s for s in systems().values() if s.country == code]
    if not found:
        return [generic(code)]
    return sorted(found, key=lambda system: (not system.main, system.id))


def summaries() -> list[SystemSummary]:
    return [
        SystemSummary.model_validate(system.model_dump())
        for system in systems().values()
    ]
