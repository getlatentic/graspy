"""Which checks of a learner's lessons are owed again. The answers kept on the record are read as the voice
lessons' evidence log is: a check is a one-event lesson plan, and the log is folded by `progress_by_plan` and
read answer by answer by `evidence_events`, so a slide lesson and a voice lesson mean the same by "alone"
and "after help". A check the learner did not get right alone, the last day they tried it, is owed on a
later day, until it has been got right alone on two days."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ..learner.record import Answer, LearnerRecord, TopicMark
from ..voice.curriculum import Activity, LessonEvent, LessonPlan
from ..voice.evidence import Evidence
from ..voice.evidence_events import EvidenceEvent, evidence_events
from ..voice.lesson_store import lesson_day
from ..voice.progress import progress_by_plan

CHECK_EVENT = "check"
# What a lesson's checks give a wrong answer before the answer is told (ladder.py).
HINTS = ("reread", "narrow")
HINT_LEVELS = ("cue", "structure")


@dataclass(frozen=True)
class Due:
    subject_slug: str
    topic: str
    slide: int


def skill_of(subject_slug: str, topic: str, slide: int) -> str:
    return f"{subject_slug}/{topic}#{slide}"


def _plan(subject_slug: str, topic: str, slide: int, plan_id: str) -> LessonPlan:
    event = LessonEvent(
        id=CHECK_EVENT,
        event="assess_performance",
        say={},
        show=None,
        activity=Activity("answer", hints=HINTS, hint_levels=HINT_LEVELS),
        skill=skill_of(subject_slug, topic, slide),
    )
    return LessonPlan(
        id=plan_id,
        subject=subject_slug,
        topic=topic,
        sequence=0,
        term=None,
        week=None,
        title={},
        classes=(),
        objectives=(),
        prerequisites=(),
        curriculum=None,
        events=(event,),
    )


def _plan_id(plan_id: str, answer: Answer) -> str:
    return f"{plan_id}/{answer.subject_slug}/{answer.topic}#{answer.slide}"


def _checks(record: LearnerRecord) -> list[Answer]:
    """The answers to a lesson's checks, in the order they were given, that were given to the lesson the
    learner has now."""
    return sorted(
        (
            answer
            for answer in record.answers
            if answer.source == "lesson"
            and answer.slide is not None
            and answer.plan_id
            and answer.subject_slug
            and answer.topic
            and answer.lesson_id
            == record.lesson_on(answer.plan_id, answer.subject_slug, answer.topic)
        ),
        key=lambda answer: answer.at,
    )


def _log(
    answers: list[Answer],
) -> tuple[dict[str, LessonPlan], list[Evidence], dict[str, Answer]]:
    plans: dict[str, LessonPlan] = {}
    asked: dict[str, Answer] = {}
    evidence = []
    for answer in answers:
        plan_id = _plan_id(answer.plan_id, answer)
        plans.setdefault(
            plan_id, _plan(answer.subject_slug, answer.topic, answer.slide, plan_id)
        )
        asked.setdefault(plan_id, answer)
        evidence.append(
            Evidence(
                plan_id,
                CHECK_EVENT,
                lesson_day(answer.at),
                "correct" if answer.correct else "try_again",
            )
        )
    return plans, evidence, asked


def _first_try_of_last_day(events: list[EvidenceEvent]) -> dict[str, EvidenceEvent]:
    first: dict[str, EvidenceEvent] = {}
    for event in events:
        held = first.get(event.plan_id)
        if held is None or event.day > held.day:
            first[event.plan_id] = event
    return first


def due_checks(record: LearnerRecord, today: date) -> list[Due]:
    """The checks to offer again today, in the order they were first asked."""
    plans, evidence, asked = _log(_checks(record))
    progress = progress_by_plan(evidence, plans, today)
    latest = _first_try_of_last_day(evidence_events(evidence, plans))
    due = []
    for plan_id, event in latest.items():
        # The first try of the day, so right means right alone.
        alone = event.outcome == "correct"
        if alone or event.day >= today or progress[plan_id].mastered:
            continue
        answer = asked[plan_id]
        due.append(Due(answer.subject_slug, answer.topic, answer.slide))
    return due


def due_topics(record: LearnerRecord, plan_id: str, today: date) -> list[TopicMark]:
    """The topics of one plan with a check owed, as the plan's own marks name them: the app lists topics by
    their place in the plan."""
    owed = {(check.subject_slug, check.topic) for check in due_checks(record, today)}
    return [
        mark
        for mark in record.topics
        if mark.plan_id == plan_id and (mark.subject_slug, mark.topic) in owed
    ]
