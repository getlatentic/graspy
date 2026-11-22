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
    actions: tuple[Action, ...] = ()
    card: Card | None = None
    # The skill this call loaded, kept with the turn so the conversation knows it.
    skill: str | None = None


# Courses one turn can offer, so a long list does not plan a dozen at once.
MAX_PATH_GOALS = 5


def actions_for_app(actions: list[Action]) -> list[Action]:
    """Of two opens, or two edits, in one turn the last counts, except that
    changes of subjects are merged: what the tutor told the learner of each is
    true. Each course a turn proposes counts, once for a name and up to a cap.
    A change that asks the learner to confirm comes with no courses, which would
    hide it."""
    others = [action for action in actions if not isinstance(action, ProposePath)]
    last = others[-1:]
    if last and isinstance(last[0], ChangeSubjects):
        last = [
            _merged(change for change in others if isinstance(change, ChangeSubjects))
        ]
    if any(_asks_to_confirm(action) for action in others):
        return last
    return [*last, *_distinct_courses(actions)]


def _asks_to_confirm(action: Action) -> bool:
    return isinstance(action, RebuildPlan) or (
        isinstance(action, ChangeSubjects) and bool(action.remove)
    )


def _merged(changes) -> ChangeSubjects:
    adds: list[str] = []
    drops: list[str] = []
    for change in changes:
        adds.extend(change.add)
        drops.extend(change.remove)
    return ChangeSubjects(
        add=list(dict.fromkeys(name for name in adds if name not in drops)),
        remove=list(dict.fromkeys(drops)),
    )


def _distinct_courses(actions: list[Action]) -> list[Action]:
    first_of: dict[str, Action] = {}
    for action in actions:
        if isinstance(action, ProposePath):
            first_of.setdefault(action.goal.casefold(), action)
    return list(first_of.values())[:MAX_PATH_GOALS]
