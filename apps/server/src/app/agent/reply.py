"""What a tutor turn sends the app beside the answer: actions for it to do and
cards to show. scripts/export_reply_contract.py exports examples the app's
types are checked against."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import Field

from ..wire import Wire
from .cards import Card


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


class ProposePath(Wire):
    type: Literal["propose_path"] = "propose_path"
    goal: str


Action = Annotated[
    OpenTopic | OpenSubject | AddTopic | ChangeSubjects | RebuildPlan | ProposePath,
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
    action: Action | None = None
    card: Card | None = None
