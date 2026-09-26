"""What every system in the catalogue must be, beyond its shape: whole, in
order, and honest about how far it can be trusted."""

from __future__ import annotations

from .model import System


def _order_problems(system: System) -> list[str]:
    years = [level.year for level in system.levels]
    ages = [level.age for level in system.levels]
    found = []
    if years != list(range(years[0], years[0] + len(years))) or 1 not in years:
        found.append(
            "Levels must be school years in order, the first year of primary "
            f"being 1; they are {years}."
        )
    if not 3 <= ages[0] <= 9:
        found.append(f"School starts at age {ages[0]}, outside 3 to 9.")
    if ages != list(range(ages[0], ages[0] + len(ages))):
        found.append(
            f"Each level must be a year older than the one before; the ages are {ages}."
        )
    return found


def _id_problems(system: System) -> list[str]:
    stage_ids = [stage.id for stage in system.stages]
    level_ids = [level.id for level in system.levels]
    found = [
        problem
        for ids, problem in (
            (stage_ids, "Stage ids repeat."),
            (level_ids, "Level ids repeat."),
        )
        if len(set(ids)) != len(ids)
    ]
    unknown = {level.stage for level in system.levels} - set(stage_ids)
    if unknown:
        found.append(f"Levels name stages that are not listed: {sorted(unknown)}.")
    return found


def _stage_order_problems(system: System) -> list[str]:
    stage_ids = [stage.id for stage in system.stages]
    levels = system.levels
    runs = [
        level.stage
        for index, level in enumerate(levels)
        if index == 0 or levels[index - 1].stage != level.stage
    ]
    found = []
    if len(runs) != len(set(runs)):
        found.append("A stage's years must follow one another.")
    elif [stage for stage in stage_ids if stage in runs] != runs:
        found.append("Stages must be listed in the order of their years.")
    empty = set(stage_ids) - set(runs)
    if empty:
        found.append(f"Stages without levels: {sorted(empty)}.")
    return found


def _trust_problems(system: System) -> list[str]:
    problems = []
    if system.status != "draft" and not system.sources:
        problems.append("A system checked against sources must cite them.")
    if system.status == "reviewed" and system.review is None:
        problems.append("A reviewed system must say who reviewed it and when.")
    if system.status == "draft" and not system.drafted_by:
        problems.append("A draft must name who wrote it.")
    if not system.main and not system.sources:
        problems.append(
            "A system other than the country's main one must cite its sources."
        )
    return problems


def problems(system: System) -> list[str]:
    """Empty when the system may be served."""
    found = []
    if system.id.split("-")[0] != system.country:
        found.append(f"System {system.id} is not in country {system.country}.")
    return [
        *found,
        *_order_problems(system),
        *_id_problems(system),
        *_stage_order_problems(system),
        *_trust_problems(system),
    ]
