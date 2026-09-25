"""A learner's plan as their devices share it. The server reads only what
syncing needs; every other field a device keeps passes through untouched."""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import ConfigDict, Field

from ..wire import Wire
from .record import Id, PlanMerged

MAX_PLAN_CHARS = 1_000_000


class Subject(Wire):
    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1, max_length=300)
    slug: Id


class Plan(Wire):
    model_config = ConfigDict(extra="allow")

    plan_id: Id
    updated_at: int
    subjects: list[Subject] = Field(max_length=100)
    topics: dict[str, list[str]] = Field(default_factory=dict)
    levels: dict[str, dict[str, str]] = Field(default_factory=dict)
    goals: dict[str, str] = Field(default_factory=dict)
    country: str | None = None
    language: str | None = None
    grade_level: str | None = None

    def written_for(self) -> tuple[str | None, str | None, str | None]:
        """What the plan was made for: its topics suit this and nothing else."""
        return (self.country, self.language, self.grade_level)

    def json(self) -> str:
        return self.model_dump_json(by_alias=True)


@dataclass(frozen=True)
class Joined:
    plan: Plan
    # Moves what the record kept for the device's plan into the merged one.
    carried: PlanMerged | None


def joined(account: Plan | None, device: Plan, now: int) -> Joined:
    """A device's first sign-in: one plan for the account. Plans for the same
    class merge, keeping the account's subjects and adding the device's
    others; plans for different classes do not mix, and the newer wins."""
    if (
        account is None
        or account.plan_id == device.plan_id
        or account.written_for() != device.written_for()
    ):
        return Joined(newer(account, device), None)
    own = {subject.slug for subject in account.subjects}
    added = [subject for subject in device.subjects if subject.slug not in own]
    merged = account.model_copy(
        update={
            "subjects": [*account.subjects, *added],
            "topics": _added(account.topics, device.topics, added),
            "levels": _added(account.levels, device.levels, added),
            "goals": _added(account.goals, device.goals, added),
            "updated_at": now,
        }
    )
    return Joined(merged, _carried(device, merged))


def newer(stored: Plan | None, sent: Plan) -> Plan:
    if stored is None or sent.updated_at >= stored.updated_at:
        return sent
    return stored


def _added(base: dict, extra: dict, subjects: list[Subject]) -> dict:
    slugs = {subject.slug for subject in subjects}
    return {**base, **{slug: value for slug, value in extra.items() if slug in slugs}}


def _carried(device: Plan, merged: Plan) -> PlanMerged:
    """By topic name, since a subject kept from the account may list its
    topics in another order than the device's copy."""
    places = {
        slug: {topic: index for index, topic in enumerate(topics)}
        for slug, topics in merged.topics.items()
    }
    moves = {
        slug: {topic: places[slug][topic] for topic in topics if topic in places[slug]}
        for slug, topics in device.topics.items()
        if slug in places
    }
    return PlanMerged(
        from_plan=device.plan_id,
        to_plan=merged.plan_id,
        topics={slug: found for slug, found in moves.items() if found},
    )
