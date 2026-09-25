"""The learner's record, changed as the Durable Object that keeps it in
production changes it: one change at a time, as JSON text."""

import pytest

from app.learner.notes import NOTHING_YET, notes_for
from app.learner.record import (
    MAX_ANSWERS,
    Answer,
    Answered,
    Imported,
    LearnerRecord,
    Learnt,
    LessonKept,
    PlanKept,
    SubjectDropped,
    SubjectsCarried,
    TopicMark,
    TopicRef,
    changed,
    parsed,
    serialised,
)

FRACTIONS = TopicRef(
    plan_id="plan-1", subject_slug="mathematics", topic_index=1, topic="Fractions"
)
VERBS = TopicRef(plan_id="plan-1", subject_slug="english", topic_index=0, topic="Verbs")


def answer(correct: bool = False, at: int = 1, **where) -> Answer:
    return Answer(
        **{"plan_id": "plan-1", "subject_slug": "mathematics", "topic": "Fractions"}
        | where,
        source="practice",
        question=f"Question {at}",
        chosen="0.38",
        right="0.375",
        correct=correct,
        at=at,
    )


def after(*changes) -> LearnerRecord:
    stored = None
    for change in changes:
        stored = changed(stored, serialised(change))
    return parsed(stored)


def test_a_new_learner_has_an_empty_record():
    assert parsed(None) == LearnerRecord()
    assert parsed("") == LearnerRecord()


def test_a_kept_lesson_and_finishing_mark_one_topic():
    record = after(
        LessonKept(topic=FRACTIONS, lesson_id="lesson-1"),
        Learnt(topic=FRACTIONS, at=9),
    )

    [mark] = record.topics
    assert (mark.lesson_id, mark.learnt_at) == ("lesson-1", 9)
    assert record.lesson_on("plan-1", "mathematics", "Fractions") == "lesson-1"
    assert record.lesson_on("plan-2", "mathematics", "Fractions") is None


def test_a_topic_of_the_same_name_elsewhere_in_the_plan_is_its_own():
    moved = FRACTIONS.model_copy(update={"topic_index": 4})

    record = after(Learnt(topic=FRACTIONS, at=1), Learnt(topic=moved, at=2))

    assert [mark.topic_index for mark in record.topics] == [1, 4]


def test_only_the_newest_answers_are_kept():
    record = after(*(Answered(answer=answer(at=n)) for n in range(MAX_ANSWERS + 3)))

    assert len(record.answers) == MAX_ANSWERS
    assert record.answers[0].at == 3


def test_an_answer_is_cut_to_size_rather_than_refused():
    long = answer().model_copy(update={"question": "x" * 2000})

    [kept] = after(Answered(answer=Answer.model_validate(long.model_dump()))).answers

    assert len(kept.question) == 600


def test_the_devices_records_are_brought_across_once_under_the_servers():
    first = Imported(
        topics=[
            TopicMark(**FRACTIONS.model_dump(), lesson_id="old", learnt_at=1),
            TopicMark(**VERBS.model_dump(), learnt_at=2),
        ],
        answers=[answer(at=1)],
    )
    again = Imported(topics=[TopicMark(**VERBS.model_dump(), lesson_id="late")])

    record = after(
        LessonKept(topic=FRACTIONS, lesson_id="new"),
        Answered(answer=answer(at=5)),
        first,
        again,
    )

    assert record.imported
    assert {(m.topic, m.lesson_id, m.learnt_at) for m in record.topics} == {
        ("Fractions", "new", 1),
        ("Verbs", None, 2),
    }
    assert [a.at for a in record.answers] == [1, 5]


def test_a_record_narrowed_to_a_plan_keeps_that_plan_alone():
    other = FRACTIONS.model_copy(update={"plan_id": "plan-2"})
    record = after(
        Learnt(topic=FRACTIONS, at=1),
        Learnt(topic=other, at=2),
        Answered(answer=answer(plan_id="plan-2")),
    )

    narrowed = record.in_plan("plan-1")

    assert [mark.plan_id for mark in narrowed.topics] == ["plan-1"]
    assert narrowed.answers == []


def test_an_unknown_change_is_refused():
    with pytest.raises(ValueError):
        changed(None, '{"kind": "forget_everything"}')


def test_notes_name_what_was_finished_and_the_recent_mistakes_in_the_subject():
    record = after(
        Learnt(topic=FRACTIONS, at=1),
        Learnt(topic=VERBS, at=2),
        Answered(answer=answer(correct=True, at=1)),
        Answered(answer=answer(at=2)),
        Answered(answer=answer(at=3, subject_slug="english", topic="Verbs")),
    )

    notes = notes_for(record, "plan-1", "mathematics")

    assert notes.splitlines() == [
        "Finished: Fractions",
        "Answered 2 questions, 1 right.",
        "Recent mistakes:",
        "- Question 2 (Fractions): chose '0.38', the answer was '0.375'",
    ]
    assert "Verbs" in notes_for(record, "plan-1")


def test_notes_for_a_learner_with_nothing_say_so():
    assert notes_for(LearnerRecord(), "plan-1", "mathematics") == NOTHING_YET


def test_an_answer_sent_again_replaces_the_first():
    first = answer(at=1).model_copy(update={"key": "view-1:0"})
    again = answer(correct=True, at=2).model_copy(update={"key": "view-1:0"})
    other = answer(at=3).model_copy(update={"key": "view-1:1"})
    unkeyed = answer(at=4)

    record = after(
        *(Answered(answer=a) for a in (first, other, again, unkeyed, unkeyed))
    )

    assert [(a.key, a.at) for a in record.answers] == [
        ("view-1:1", 3),
        ("view-1:0", 2),
        (None, 4),
        (None, 4),
    ]


def test_a_dropped_subject_takes_its_topics_and_answers_with_it():
    record = after(
        Learnt(topic=FRACTIONS, at=1),
        Learnt(topic=VERBS, at=2),
        Answered(answer=answer()),
        SubjectDropped(plan_id="plan-1", subject_slug="mathematics"),
    )

    assert [mark.topic for mark in record.topics] == ["Verbs"]
    assert record.answers == []


def test_carried_subjects_keep_their_record_in_the_new_plan_and_the_rest_go():
    record = after(
        LessonKept(topic=FRACTIONS, lesson_id="lesson-1"),
        Learnt(topic=VERBS, at=2),
        Answered(answer=answer()),
        SubjectsCarried(
            from_plan="plan-1", to_plan="plan-2", subject_slugs=["mathematics"]
        ),
        PlanKept(plan_id="plan-2"),
    )

    [mark] = record.topics
    assert (mark.plan_id, mark.topic, mark.lesson_id) == (
        "plan-2",
        "Fractions",
        "lesson-1",
    )
    assert [a.plan_id for a in record.answers] == ["plan-2"]
    assert record.lesson_on("plan-2", "mathematics", "Fractions") == "lesson-1"


def test_carrying_twice_does_not_double_the_record():
    carry = SubjectsCarried(
        from_plan="plan-1", to_plan="plan-2", subject_slugs=["mathematics"]
    )

    record = after(Learnt(topic=FRACTIONS, at=1), carry, carry)

    assert [m.plan_id for m in record.topics] == ["plan-1", "plan-2"]


def test_a_mistake_brought_from_a_device_is_named_without_what_was_chosen():
    brought = answer().model_copy(update={"chosen": "", "right": ""})

    notes = notes_for(after(Answered(answer=brought)), "plan-1")

    assert notes.splitlines()[-1] == "- Question 1 (Fractions)"
