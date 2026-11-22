"""A turn makes one change to the plan; each call is told what was and was not done."""

import pytest

from app.agent.refusal import refusal
from app.agent.reply import (
    MAX_PATH_GOALS,
    AddTopic,
    ChangeSubjects,
    OpenSubject,
    OpenTopic,
    Outcome,
    ProposePath,
    RebuildPlan,
)
from app.agent.turn_policy import ONE_CHANGE, admit

ROOM = 10
CHANGES = [
    ChangeSubjects(add=["Chess"], remove=[]),
    ChangeSubjects(add=[], remove=["History"]),
    RebuildPlan(),
    AddTopic(subject_slug="a", subject="A", topic="Surds"),
    OpenSubject(subject_slug="a", subject="A"),
    OpenTopic(subject_slug="a", topic_index=0, topic="T"),
]
IDS = ["add", "drop", "rebuild", "topic", "open-subject", "open-topic"]


def call(*actions) -> Outcome:
    return Outcome(told={"done": "ok"}, actions=tuple(actions))


def courses(*goals: str) -> Outcome:
    return Outcome(
        told={"shown": "all"}, actions=tuple(ProposePath(goal=g) for g in goals)
    )


@pytest.mark.parametrize("first", CHANGES, ids=IDS)
@pytest.mark.parametrize("second", CHANGES, ids=IDS)
def test_a_second_change_in_a_turn_is_refused_and_the_call_says_so(first, second):
    actions = []
    admit(actions, call(first), ROOM)

    told = admit(actions, call(second), ROOM)

    assert told == refusal(ONE_CHANGE)
    assert actions == [first]


@pytest.mark.parametrize("change", CHANGES, ids=IDS)
def test_courses_are_refused_after_a_change_and_a_change_after_courses(change):
    actions = []
    admit(actions, call(change), ROOM)
    assert admit(actions, courses("Astronomy"), ROOM) == refusal(ONE_CHANGE)

    actions = []
    admit(actions, courses("Astronomy"), ROOM)
    assert admit(actions, call(change), ROOM) == refusal(ONE_CHANGE)
    assert [type(a) for a in actions] == [ProposePath]


def test_a_call_that_changes_nothing_is_told_as_it_was():
    actions = []

    told = admit(actions, Outcome(told={"note": "nothing"}), ROOM)

    assert told == {"note": "nothing"}
    assert actions == []


def test_several_calls_of_courses_are_one_batch_each_course_once_whatever_its_spelling():
    actions = []

    admit(actions, courses("Quantum  computing", "quantum COMPUTING", "Géologie"), ROOM)
    again = admit(actions, courses("geologie", "Astronomy"), ROOM)

    assert [a.goal for a in actions] == ["Quantum  computing", "Géologie", "Astronomy"]
    assert "Astronomy" in again["shown"]
    assert "geologie" not in again["shown"]


def test_courses_across_calls_stop_at_the_cap_and_the_model_is_told_which():
    actions = []
    admit(actions, courses(*[f"Course {n}" for n in range(4)]), ROOM)

    told = admit(actions, courses("Course 4", "Course 5", "Course 6"), ROOM)

    assert len(actions) == MAX_PATH_GOALS
    assert "Course 5 and Course 6" in told["not_offered"]
    assert "Course 5" not in told["shown"]


def test_courses_stop_at_the_room_the_plan_has_and_the_call_says_so():
    actions = []

    told = admit(actions, courses("A", "B", "C"), 2)

    assert [a.goal for a in actions] == ["A", "B"]
    assert "room for 2 more courses" in told["not_offered"]
    assert "C" in told["not_offered"]


def test_a_full_plan_is_offered_no_course():
    actions = []

    told = admit(actions, courses("A"), 0)

    assert "room for 0 more" in told["error"]
    assert actions == []


def test_a_call_with_only_courses_over_the_cap_is_refused():
    actions = []
    admit(actions, courses(*[f"Course {n}" for n in range(MAX_PATH_GOALS)]), ROOM)

    told = admit(actions, courses("One more"), ROOM)

    assert "error" in told
    assert len(actions) == MAX_PATH_GOALS


def test_courses_already_offered_say_so_and_add_nothing():
    actions = []
    admit(actions, courses("Astronomy"), ROOM)

    told = admit(actions, courses("astronomy"), ROOM)

    assert "already offered" in told["note"]
    assert len(actions) == 1
