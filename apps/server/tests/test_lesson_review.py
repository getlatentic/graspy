"""A check the learner did not get right alone is owed again on a later day, read from the answers the
record keeps as the voice lessons' evidence is read."""

from datetime import date, datetime, timedelta

import pytest

from app.learner.record import Answer, LearnerRecord, TopicMark
from app.lessons.review import due_checks, due_topics
from app.voice.lesson_store import LAGOS

DAY_ONE = date(2026, 11, 2)
LESSON = "lesson-1"


def at(day: int, minute: int = 0) -> int:
    start = datetime(2026, 11, 2, 12, minute, tzinfo=LAGOS) + timedelta(days=day - 1)
    return round(start.timestamp() * 1000)


def tried(day: int, attempt: int, correct: bool, slide: int = 0, **kept) -> Answer:
    """The `attempt`th try at a check on lesson day `day`, a minute later for each."""
    return Answer(
        **{
            "plan_id": "plan-1",
            "subject_slug": "mathematics",
            "topic": "Fractions",
            "lesson_id": LESSON,
            "slide": slide,
        }
        | kept,
        source="lesson",
        question="Which is bigger?",
        correct=correct,
        at=at(day, attempt),
    )


def record(*answers: Answer) -> LearnerRecord:
    mark = TopicMark(
        plan_id="plan-1",
        subject_slug="mathematics",
        topic_index=1,
        topic="Fractions",
        lesson_id=LESSON,
    )
    return LearnerRecord(topics=[mark], answers=list(answers))


def due(*answers: Answer, day: int) -> list[int]:
    today = DAY_ONE + timedelta(days=day - 1)
    return [check.slide for check in due_checks(record(*answers), today)]


def test_a_check_missed_on_an_earlier_day_is_offered_again():
    assert due(tried(1, 1, False), tried(1, 2, True), day=2) == [0]


def test_a_check_is_not_offered_again_the_day_it_was_missed():
    assert due(tried(1, 1, False), day=1) == []


def test_a_check_answered_alone_is_not_owed():
    assert due(tried(1, 1, True), day=2) == []


def test_a_check_got_right_only_after_help_is_still_owed():
    assert due(tried(1, 1, False), tried(1, 2, True), day=3) == [0]


def test_a_check_got_right_alone_on_a_later_day_is_no_longer_owed():
    answers = (tried(1, 1, False), tried(2, 1, True))
    assert due(*answers, day=3) == []


def test_a_check_got_right_alone_and_then_missed_is_owed_again():
    answers = (tried(1, 1, True), tried(2, 1, False))
    assert due(*answers, day=3) == [0]


def test_a_check_right_alone_on_two_days_is_never_owed_again():
    answers = (tried(1, 1, True), tried(2, 1, True), tried(3, 1, False))
    assert due(*answers, day=4) == []


def test_each_slides_check_is_owed_by_itself():
    answers = (tried(1, 1, False, slide=2), tried(1, 1, True, slide=0))
    assert due(*answers, day=2) == [2]


def test_answers_to_a_lesson_made_since_are_not_read():
    old = tried(1, 1, False, lesson_id="old-lesson")
    assert due(old, day=2) == []


def test_a_practice_answer_and_an_answer_with_no_slide_are_not_checks():
    practice = tried(1, 1, False).model_copy(update={"source": "practice"})
    older = tried(1, 1, False).model_copy(update={"slide": None})
    assert due(practice, older, day=2) == []


def test_owed_checks_name_their_topics_by_place_in_the_plan():
    answers = (tried(1, 1, False),)
    [mark] = due_topics(record(*answers), "plan-1", date(2026, 11, 3))
    assert (mark.subject_slug, mark.topic_index, mark.topic) == (
        "mathematics",
        1,
        "Fractions",
    )
    assert due_topics(record(*answers), "plan-2", date(2026, 11, 3)) == []


@pytest.mark.parametrize("day", [1, 2])
def test_the_lesson_day_turns_over_at_four_in_the_morning(day):
    late = tried(1, 1, False).model_copy(
        update={"at": round(datetime(2026, 11, 3, 2, tzinfo=LAGOS).timestamp() * 1000)}
    )
    assert due(late, day=day) == ([] if day == 1 else [0])


def test_an_answer_kept_with_no_lesson_is_not_read():
    assert due(tried(1, 1, False, lesson_id=None), day=2) == []


def test_a_check_of_another_plan_with_the_same_topic_is_not_offered_here():
    other = tried(1, 1, False, plan_id="plan-2", lesson_id=LESSON)
    owed = due_checks(
        record(other).model_copy(
            update={
                "topics": [
                    TopicMark(
                        plan_id="plan-2",
                        subject_slug="mathematics",
                        topic_index=0,
                        topic="Fractions",
                        lesson_id=LESSON,
                    )
                ]
            }
        ),
        date(2026, 11, 3),
    )
    assert [(d.plan_id, d.slide) for d in owed] == [("plan-2", 0)]
