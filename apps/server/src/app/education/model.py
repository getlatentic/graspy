"""A school system: one country's schools, or a part of a country whose
schools differ, such as Scotland. Its levels are the school years from the
first of primary to the last of upper secondary, named as learners there name
them, each with the age a learner starts it."""

from __future__ import annotations

import datetime
import re
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, HttpUrl, StringConstraints

from ..wire import Wire

SLUG = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
# A system is its country, or a part of it: "NG", "GB-SCT".
SYSTEM_ID = r"^[A-Z]{2}(?:-[A-Z0-9]{2,3})?$"
LANGUAGE_TAG = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")

Slug = Annotated[str, StringConstraints(pattern=SLUG, max_length=60)]
Text = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


def _tagged(names: dict[str, str]) -> dict[str, str]:
    for tag in names:
        if not LANGUAGE_TAG.match(tag):
            raise ValueError(f"{tag!r} is not a language tag")
    return names


class Names(Wire):
    en: Text
    # By language tag, where the country's schools name it otherwise.
    local: Annotated[dict[str, Text], AfterValidator(_tagged)] = Field(
        default_factory=dict
    )


class Source(Wire):
    title: Text
    url: HttpUrl


# How far the data can be trusted:
# draft: some of it could not be confirmed by official sources;
# sourced: checked against the official sources it cites;
# reviewed: also read by a person who knows the country's schools.
Status = Literal["draft", "sourced", "reviewed"]


class Stage(Wire):
    id: Slug
    name: Names


class Level(Wire):
    id: Slug
    stage: Slug
    # Counted from the first year of primary, so years before it are 0, -1 and on.
    year: int = Field(ge=-4, le=15)
    age: int = Field(ge=3, le=21)
    name: Names
    aliases: list[Text] = Field(default_factory=list, max_length=8)


class Review(Wire):
    by: Text
    on: datetime.date


class System(Wire):
    id: Annotated[str, StringConstraints(pattern=SYSTEM_ID)]
    country: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]
    name: Names
    # The one most of the country's schools follow, when it has several.
    main: bool = True
    status: Status
    stages: list[Stage] = Field(min_length=1, max_length=8)
    levels: list[Level] = Field(min_length=3, max_length=15)
    sources: list[Source] = Field(default_factory=list, max_length=8)
    review: Review | None = None
    drafted_by: Text | None = None
    # The last year of a system being replaced.
    until: int | None = Field(default=None, ge=2000, le=2100)
    notes: Annotated[str, StringConstraints(max_length=600)] | None = None
