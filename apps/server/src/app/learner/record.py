"""What the server knows of a learner's device: the topics they have a lesson
for or have finished, and how they answered questions. Changes are applied
here, to the record as JSON text, so the Durable Object that keeps it holds
no logic of its own."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, TypeAdapter

from ..wire import Wire

# The newest are kept.
MAX_ANSWERS = 500
MAX_TOPICS = 2000
MAX_CONVERSATIONS = 500
MAX_TEXT = 600
MAX_NAME = 300


def _clip(limit: int):
    return BeforeValidator(
        lambda value: (
            " ".join(value.split())[:limit] if isinstance(value, str) else value
        )
    )


Text = Annotated[str, _clip(MAX_TEXT)]
# The same answer sent again, as a card does when the learner then writes to
# the tutor, replaces the first rather than counting twice.
Key = Annotated[str, Field(max_length=120)]
# A topic's name identifies it, so one too long is refused, never cut into
# another topic's name.
Name = Annotated[str, Field(min_length=1, max_length=MAX_NAME)]
Id = Annotated[str, Field(min_length=1, max_length=80)]


class TopicRef(Wire):
    plan_id: Id
    subject_slug: Id
    topic_index: int = Field(ge=0, le=500)
    topic: Name

    def same_topic(self, other: TopicRef) -> bool:
        return (
            self.plan_id,
            self.subject_slug,
            self.topic_index,
            self.topic,
        ) == (other.plan_id, other.subject_slug, other.topic_index, other.topic)


class TopicMark(TopicRef):
    lesson_id: Id | None = None
    learnt_at: int | None = None


class Where(Wire):
    plan_id: Id | None = None
    subject_slug: Id | None = None
    topic: Name | None = None


class Answer(Where):
    key: Key | None = None
    source: Literal["practice", "lesson"]
    question: Text
    # Empty for an answer a device kept before the server did.
    chosen: Text = ""
    right: Text = ""
    correct: bool
    at: int


class LearnerRecord(Wire):
    topics: list[TopicMark] = Field(default_factory=list)
    answers: list[Answer] = Field(default_factory=list)
    imported: bool = False
    # The devices whose records an account has taken in.
    joined: list[str] = Field(default_factory=list)
    # A hint only: two phones of one model share one.
    fingerprint: str | None = None
    # The tutor conversations held, so forgetting the learner forgets them.
    conversations: list[str] = Field(default_factory=list)

    def mark(self, ref: TopicRef) -> TopicMark | None:
        return next((mark for mark in self.topics if mark.same_topic(ref)), None)

    def lesson_on(self, plan_id: str, subject_slug: str, topic: str) -> str | None:
        """Found by name: a conversation knows its topic, not the topic's
        place in the plan."""
        return next(
            (
                mark.lesson_id
                for mark in reversed(self.topics)
                if mark.lesson_id
                and (mark.plan_id, mark.subject_slug, mark.topic)
                == (plan_id, subject_slug, topic)
            ),
            None,
        )

    def for_app(self, plan_id: str) -> dict:
        return self.in_plan(plan_id).model_dump(
            by_alias=True, exclude={"fingerprint", "joined", "conversations"}
        )

    def in_plan(self, plan_id: str) -> LearnerRecord:
        return self.model_copy(
            update={
                "topics": [t for t in self.topics if t.plan_id == plan_id],
                "answers": [a for a in self.answers if a.plan_id == plan_id],
            }
        )


class Answered(Wire):
    kind: Literal["answered"] = "answered"
    answer: Answer


class LessonKept(Wire):
    kind: Literal["lesson_kept"] = "lesson_kept"
    topic: TopicRef
    lesson_id: Id


class Learnt(Wire):
    kind: Literal["learnt"] = "learnt"
    topic: TopicRef
    at: int


class Seen(Wire):
    kind: Literal["seen"] = "seen"
    fingerprint: Annotated[str, Field(pattern=r"^[a-f0-9]{8,64}$")]


class Conversed(Wire):
    kind: Literal["conversed"] = "conversed"
    # The A2A context id, which the client chooses.
    conversation_id: Annotated[str, Field(min_length=1, max_length=200)]


class Imported(Wire):
    kind: Literal["imported"] = "imported"
    topics: list[TopicMark] = Field(default_factory=list, max_length=MAX_TOPICS)
    answers: list[Answer] = Field(default_factory=list, max_length=MAX_ANSWERS)


class DeviceJoined(Wire):
    """A device's record, taken into an account on its first sign-in there."""

    kind: Literal["device_joined"] = "device_joined"
    device: Id
    topics: list[TopicMark] = Field(default_factory=list, max_length=MAX_TOPICS)
    answers: list[Answer] = Field(default_factory=list, max_length=MAX_ANSWERS)


class PlanMerged(Wire):
    """Moves what was kept for one plan into another, by subject and topic
    name: the topic's place in the new plan."""

    kind: Literal["plan_merged"] = "plan_merged"
    from_plan: Id
    to_plan: Id
    topics: dict[str, dict[str, int]] = Field(default_factory=dict)


# What the learner's app does to the record as their plan changes. A plan
# made again is a new plan: its positions name different topics, so what was
# kept for the old one is dropped, except for subjects carried into it.


class SubjectDropped(Wire):
    kind: Literal["subject_dropped"] = "subject_dropped"
    plan_id: Id
    subject_slug: Id


class SubjectsCarried(Wire):
    kind: Literal["subjects_carried"] = "subjects_carried"
    from_plan: Id
    to_plan: Id
    subject_slugs: list[Id] = Field(max_length=50)


class PlanKept(Wire):
    """Drops everything kept for any other plan."""

    kind: Literal["plan_kept"] = "plan_kept"
    plan_id: Id


PlanChange = Annotated[
    SubjectDropped | SubjectsCarried | PlanKept, Field(discriminator="kind")
]
Change = Annotated[
    Answered
    | LessonKept
    | Learnt
    | Seen
    | Imported
    | SubjectDropped
    | SubjectsCarried
    | PlanKept
    | DeviceJoined
    | PlanMerged
    | Conversed,
    Field(discriminator="kind"),
]
_CHANGE = TypeAdapter(Change)


def parsed(stored: str | None) -> LearnerRecord:
    return LearnerRecord.model_validate_json(stored or "{}")


def serialised(change: Change) -> str:
    return change.model_dump_json(by_alias=True)


def _with_mark(record: LearnerRecord, ref: TopicRef, **update) -> LearnerRecord:
    current = record.mark(ref) or TopicMark(**ref.model_dump())
    others = [mark for mark in record.topics if not mark.same_topic(ref)]
    marked = current.model_copy(update=update)
    return record.model_copy(update={"topics": [*others, marked][-MAX_TOPICS:]})


def _taken_in(
    record: LearnerRecord, topics: list[TopicMark], answers: list[Answer]
) -> LearnerRecord:
    """Under what the record already has, which wins."""
    for mark in topics:
        existing = record.mark(mark)
        record = _with_mark(
            record,
            mark,
            lesson_id=(existing and existing.lesson_id) or mark.lesson_id,
            learnt_at=(existing and existing.learnt_at) or mark.learnt_at,
        )
    known = {answer.key for answer in record.answers if answer.key}
    fresh = [answer for answer in answers if not (answer.key and answer.key in known)]
    ordered = sorted([*fresh, *record.answers], key=lambda a: a.at)
    return record.model_copy(update={"answers": ordered[-MAX_ANSWERS:]})


def _imported(record: LearnerRecord, change: Imported) -> LearnerRecord:
    if record.imported:
        return record
    taken = _taken_in(record, change.topics, change.answers)
    return taken.model_copy(update={"imported": True})


def _device_joined(record: LearnerRecord, change: DeviceJoined) -> LearnerRecord:
    if change.device in record.joined:
        return record
    taken = _taken_in(record, change.topics, change.answers)
    return taken.model_copy(update={"joined": [*record.joined, change.device]})


def _plan_merged(record: LearnerRecord, change: PlanMerged) -> LearnerRecord:
    def place(plan_id, slug, topic):
        if plan_id != change.from_plan:
            return None
        return change.topics.get(slug, {}).get(topic)

    moved = [
        mark.model_copy(update={"plan_id": change.to_plan, "topic_index": index})
        for mark in record.topics
        if (index := place(mark.plan_id, mark.subject_slug, mark.topic)) is not None
    ]
    answers = [
        answer.model_copy(update={"plan_id": change.to_plan})
        if place(answer.plan_id, answer.subject_slug, answer.topic) is not None
        else answer
        for answer in record.answers
    ]
    kept = record.model_copy(update={"answers": answers})
    return _taken_in(kept, moved, [])


def _kept_where(record: LearnerRecord, keep) -> LearnerRecord:
    """``keep`` reads (plan, subject)."""
    return record.model_copy(
        update={
            "topics": [t for t in record.topics if keep(t.plan_id, t.subject_slug)],
            "answers": [a for a in record.answers if keep(a.plan_id, a.subject_slug)],
        }
    )


def _carried(record: LearnerRecord, change: SubjectsCarried) -> LearnerRecord:
    moving = set(change.subject_slugs)

    def moved(items):
        return [
            item.model_copy(update={"plan_id": change.to_plan})
            for item in items
            if item.plan_id == change.from_plan and item.subject_slug in moving
        ]

    others = _kept_where(
        record,
        lambda plan, slug: not (plan == change.to_plan and slug in moving),
    )
    return record.model_copy(
        update={
            "topics": [*others.topics, *moved(record.topics)][-MAX_TOPICS:],
            "answers": sorted(
                [*others.answers, *moved(record.answers)], key=lambda a: a.at
            )[-MAX_ANSWERS:],
        }
    )


def _planned(record: LearnerRecord, change: PlanChange) -> LearnerRecord:
    match change:
        case SubjectDropped(plan_id=plan_id, subject_slug=subject_slug):
            return _kept_where(
                record, lambda plan, slug: (plan, slug) != (plan_id, subject_slug)
            )
        case SubjectsCarried():
            return _carried(record, change)
        case PlanKept(plan_id=plan_id):
            return _kept_where(record, lambda plan, _slug: plan == plan_id)


def _conversed(record: LearnerRecord, change: Conversed) -> LearnerRecord:
    if change.conversation_id in record.conversations:
        return record
    held = [*record.conversations, change.conversation_id][-MAX_CONVERSATIONS:]
    return record.model_copy(update={"conversations": held})


def applied(record: LearnerRecord, change: Change) -> LearnerRecord:
    match change:
        case Answered(answer=answer):
            others = [
                a for a in record.answers if not (answer.key and a.key == answer.key)
            ]
            answers = [*others, answer][-MAX_ANSWERS:]
            return record.model_copy(update={"answers": answers})
        case LessonKept(topic=topic, lesson_id=lesson_id):
            return _with_mark(record, topic, lesson_id=lesson_id)
        case Learnt(topic=topic, at=at):
            return _with_mark(record, topic, learnt_at=at)
        case Seen(fingerprint=fingerprint):
            return record.model_copy(update={"fingerprint": fingerprint})
        case Imported():
            return _imported(record, change)
        case SubjectDropped() | SubjectsCarried() | PlanKept():
            return _planned(record, change)
        case DeviceJoined():
            return _device_joined(record, change)
        case PlanMerged():
            return _plan_merged(record, change)
        case Conversed():
            return _conversed(record, change)


def changed(stored: str | None, change_json: str) -> str:
    record = applied(parsed(stored), _CHANGE.validate_json(change_json))
    return record.model_dump_json(by_alias=True)
