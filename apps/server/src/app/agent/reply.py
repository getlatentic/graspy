"""What a tutor turn sends the app beside the answer: actions for it to do and
cards to show. scripts/export_reply_contract.py exports examples the app's
types are checked against."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import Field

from ..wire import Wire
from .cards import Card, PlannedPath


class OpenTopic(Wire):
    type: Literal["open_topic"] = "open_topic"
    subject_slug: str
    topic_index: int
    topic: str


class OpenSubject(Wire):
    type: Literal["open_subject"] = "open_subject"
    subject_slug: str
    subject: str


class AddTopic(Wire):
    type: Literal["add_topic"] = "add_topic"
    subject_slug: str
    subject: str
    topic: str


class ChangeSubjects(Wire):
    type: Literal["change_subjects"] = "change_subjects"
    add: list[str]
    remove: list[str]


class RebuildPlan(Wire):
    type: Literal["rebuild_plan"] = "rebuild_plan"


class SetDetails(Wire):
    type: Literal["set_details"] = "set_details"
    # What the learner said, empty when they did not say it.
    class_name: str
    country: str
    course: str
    # The catalogue's code for the country, when the server could place it: the app saves by it,
    # and by the name only when this is empty.
    country_code: str = ""


class AddedPath(PlannedPath):
    """A course the learner chose topics of. The slug is the subject's place in their plan, which
    the app keeps when it is free: the lesson made for a topic is found by it."""

    slug: str


class AddPaths(Wire):
    """What the learner chose to add from a path card: new subjects, each with the topics they
    kept."""

    type: Literal["add_paths"] = "add_paths"
    paths: list[AddedPath]


Action = Annotated[
    OpenTopic
    | OpenSubject
    | AddTopic
    | ChangeSubjects
    | RebuildPlan
    | AddPaths
    | SetDetails,
    Field(discriminator="type"),
]


class ReplyData(Wire):
    follow_ups: list[str] = Field(default_factory=list)
    actions: list[Action] = Field(default_factory=list)
    cards: list[Card] = Field(default_factory=list)


@dataclass(frozen=True)
class Outcome:
    """What a tool gives back: what the model reads, and what reaches the
    app. A tool that only answers the model returns a plain dict."""

    told: dict
    actions: tuple[Action, ...] = ()
    card: Card | None = None
    # The skill this call loaded, kept with the turn so the conversation knows it.
    skill: str | None = None


# Courses one turn can offer, so a long list does not plan a dozen at once.
MAX_PATH_GOALS = 5
