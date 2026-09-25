"""The learners a signed-in account holds: a parent's children, or the account
holder alone. Each learner has a record and a plan of their own; the account
only lists them. Changes are applied here, to the list as JSON text, so the
Durable Object that keeps it holds no logic of its own."""

from __future__ import annotations

import secrets
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, TypeAdapter

from ..wire import Wire

MAX_LEARNERS = 8
MAX_LEARNER_NAME = 40


def _trimmed(value: object) -> object:
    return " ".join(value.split()) if isinstance(value, str) else value


LearnerName = Annotated[
    str,
    BeforeValidator(_trimmed),
    Field(min_length=1, max_length=MAX_LEARNER_NAME),
]
LearnerId = Annotated[str, Field(pattern=r"^[a-f0-9]{12}$")]


class Learner(Wire):
    id: LearnerId
    name: LearnerName
    created_at: int


class Directory(Wire):
    learners: list[Learner] = Field(default_factory=list)

    def find(self, learner_id: str) -> Learner | None:
        return next((one for one in self.learners if one.id == learner_id), None)

    @property
    def full(self) -> bool:
        return len(self.learners) >= MAX_LEARNERS


class LearnerAdded(Wire):
    kind: Literal["learner_added"] = "learner_added"
    learner: Learner


class LearnerRenamed(Wire):
    kind: Literal["learner_renamed"] = "learner_renamed"
    id: LearnerId
    name: LearnerName


class LearnerRemoved(Wire):
    kind: Literal["learner_removed"] = "learner_removed"
    id: LearnerId


DirectoryChange = Annotated[
    LearnerAdded | LearnerRenamed | LearnerRemoved, Field(discriminator="kind")
]
_CHANGE = TypeAdapter(DirectoryChange)


def new_learner(name: str, now: int) -> Learner:
    return Learner(id=secrets.token_hex(6), name=name, created_at=now)


def _renamed(learner: Learner, change: LearnerRenamed) -> Learner:
    if learner.id != change.id:
        return learner
    return learner.model_copy(update={"name": change.name})


def applied(directory: Directory, change: DirectoryChange) -> Directory:
    """A learner added past the limit, or twice, is not added."""
    match change:
        case LearnerAdded(learner=learner):
            if directory.full or directory.find(learner.id):
                return directory
            learners = [*directory.learners, learner]
        case LearnerRenamed():
            learners = [_renamed(one, change) for one in directory.learners]
        case LearnerRemoved(id=removed):
            learners = [one for one in directory.learners if one.id != removed]
    return directory.model_copy(update={"learners": learners})


def parsed_directory(stored: str | None) -> Directory:
    return Directory.model_validate_json(stored or "{}")


def serialised_change(change: DirectoryChange) -> str:
    return change.model_dump_json(by_alias=True)


def directory_changed(stored: str | None, change_json: str) -> str:
    directory = applied(parsed_directory(stored), _CHANGE.validate_json(change_json))
    return directory.model_dump_json(by_alias=True)


def account_key(uid: str) -> str:
    """Where the account's list is kept. Device ids have no colon, so an
    account is never taken for a device."""
    return f"account:{uid}"


def learner_key(uid: str, learner_id: str) -> str:
    return f"account:{uid}/{learner_id}"
