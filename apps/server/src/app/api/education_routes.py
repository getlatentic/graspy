"""The catalogue's school systems, for the app to ask a learner which class
they are in. Open and cached: the same for everyone, and free to serve."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Response

from ..education.catalogue import (
    SystemSummary,
    SystemView,
    of_country,
    summaries,
    systems,
    view,
)

education_router = APIRouter(tags=["education"])

CACHE = "public, max-age=3600"

SystemId = Annotated[str, Path(pattern=r"^[A-Z]{2}(?:-[A-Z0-9]{2,3})?$")]
Country = Annotated[str, Path(pattern=r"^[A-Z]{2}$")]


@education_router.get("/education/systems", response_model=list[SystemSummary])
async def list_systems(response: Response) -> list[SystemSummary]:
    response.headers["Cache-Control"] = CACHE
    return summaries()


@education_router.get("/education/countries/{country}", response_model=list[SystemView])
async def country_systems(country: Country, response: Response) -> list[SystemView]:
    response.headers["Cache-Control"] = CACHE
    return [view(system) for system in of_country(country)]


@education_router.get("/education/systems/{system_id}", response_model=SystemView)
async def get_system(system_id: SystemId, response: Response) -> SystemView:
    system = systems().get(system_id)
    if system is None:
        raise HTTPException(status_code=404, detail={"error": "No such system"})
    response.headers["Cache-Control"] = CACHE
    return view(system)
