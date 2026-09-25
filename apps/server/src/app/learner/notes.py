"""The learner's record as the model reads it: short, since it rides along
with every tutor turn and lesson plan."""

from __future__ import annotations

from .record import Answer, LearnerRecord, TopicMark

NOTHING_YET = "Nothing yet: this learner has not answered or finished anything."
RECENT_MISTAKES = 5
MAX_FINISHED = 15


def _in(item: Answer | TopicMark, subject_slug: str | None) -> bool:
    return subject_slug is None or item.subject_slug == subject_slug


def _mistake(answer: Answer) -> str:
    place = f" ({answer.topic})" if answer.topic else ""
    if not answer.chosen:
        return f"- {answer.question}{place}"
    return (
        f"- {answer.question}{place}: chose {answer.chosen!r}, "
        f"the answer was {answer.right!r}"
    )


def _finished(topics: list[str]) -> list[str]:
    return ["Finished: " + "; ".join(topics[-MAX_FINISHED:])] if topics else []


def _answered(answers: list[Answer]) -> list[str]:
    if not answers:
        return []
    right = sum(answer.correct for answer in answers)
    lines = [f"Answered {len(answers)} questions, {right} right."]
    mistakes = [answer for answer in answers if not answer.correct]
    if mistakes:
        lines.append("Recent mistakes:")
        lines.extend(map(_mistake, mistakes[-RECENT_MISTAKES:]))
    return lines


def notes_for(
    record: LearnerRecord, plan_id: str | None, subject_slug: str | None = None
) -> str:
    """Narrowed to a subject when the learner is in one."""
    if plan_id:
        record = record.in_plan(plan_id)
    finished = [
        mark.topic
        for mark in record.topics
        if mark.learnt_at and _in(mark, subject_slug)
    ]
    answers = [answer for answer in record.answers if _in(answer, subject_slug)]
    return "\n".join([*_finished(finished), *_answered(answers)]) or NOTHING_YET
