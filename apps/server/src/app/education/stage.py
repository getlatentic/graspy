"""A learner's stage of schooling and age, found through the catalogue from
the class the request names, so every prompt aims at the same learner. A
class the catalogue cannot place has no stage: the prompts then read only its
name, as the grade."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .model import Level
from .route import named

# As the apps write a class after school: "Undergraduate student, studying
# Accounting" (afterSchoolDescriptor on the web and on Android).
AFTER_SCHOOL_PREFIXES = ("Undergraduate student, ", "Graduate student, ")


class Stage(StrEnum):
    EARLY_YEARS = "early years"
    LOWER_PRIMARY = "lower primary"
    UPPER_PRIMARY = "upper primary"
    JUNIOR_SECONDARY = "junior secondary"
    SENIOR_SECONDARY = "senior secondary"
    AFTER_SCHOOL = "after school"


@dataclass(frozen=True)
class LearnerStage:
    stage: Stage
    # The age a learner starts the class; None after school.
    age: int | None

    def age_text(self) -> str:
        return "an adult" if self.age is None else str(self.age)

    def described(self) -> str:
        """As the prompts read it: lower primary, age 7."""
        age = "an adult" if self.age is None else f"age {self.age}"
        return f"{self.stage.value}, {age}"


def _school_stage(level: Level, voice_only: bool) -> Stage:
    """By the year counted from the first of primary, not by the stage's
    name: countries name and split their stages differently, and the years
    are what the catalogue's checks hold every system to."""
    if voice_only or level.year <= 0:
        return Stage.EARLY_YEARS
    if level.year <= 3:
        return Stage.LOWER_PRIMARY
    if level.year <= 6:
        return Stage.UPPER_PRIMARY
    if level.year <= 9:
        return Stage.JUNIOR_SECONDARY
    return Stage.SENIOR_SECONDARY


def stage_of(grade_level: str | None) -> LearnerStage | None:
    """The stage and age of the class a request names by its full name, as
    the apps write it; None for a class the catalogue does not hold."""
    if not grade_level:
        return None
    if grade_level.startswith(AFTER_SCHOOL_PREFIXES):
        return LearnerStage(Stage.AFTER_SCHOOL, None)
    found = named(grade_level)
    if found is None:
        return None
    system, level = found
    voice_only = next(s.voice_only for s in system.stages if s.id == level.stage)
    return LearnerStage(_school_stage(level, voice_only), level.age)
