"""Numbered grades for a country the catalogue does not cover: six years of
primary from age 6, then three of lower and three of upper secondary, the
most common shape."""

from __future__ import annotations

from .model import Level, Names, Stage, System

STAGES = [
    Stage(id="primary", name=Names(en="Primary")),
    Stage(id="lower-secondary", name=Names(en="Lower secondary")),
    Stage(id="upper-secondary", name=Names(en="Upper secondary")),
]


def generic(country: str) -> System:
    return System(
        id=country,
        country=country,
        name=Names(en=country),
        status="draft",
        drafted_by="graspy",
        stages=STAGES,
        levels=[
            Level(
                id=f"grade-{year}",
                stage=STAGES[(year > 6) + (year > 9)].id,
                year=year,
                age=year + 5,
                name=Names(en=f"Grade {year}"),
            )
            for year in range(1, 13)
        ],
    )
