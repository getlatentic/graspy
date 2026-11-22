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
from app.agent.turn_policy import ALREADY, FULL, ONE_CHANGE, admit

ROOM = 10
WRITES = [
    ChangeSubjects(add=["Chess"], remove=[]),
    ChangeSubjects(add=[], remove=["History"]),
    RebuildPlan(),
    AddTopic(subject_slug="a", subject="A", topic="Surds"),
]
OPENS = [
    OpenSubject(subject_slug="a", subject="A"),
    OpenTopic(subject_slug="a", topic_index=0, topic="T"),
]
WRITE_IDS = ["add", "drop", "rebuild", "topic"]
OPEN_IDS = ["open-subject", "open-topic"]


def call(*actions) -> Outcome:
    return Outcome(told={"done": "ok"}, actions=tuple(actions))


def courses(*goals: str) -> Outcome:
    return Outcome(
        told={"shown": "all"}, actions=tuple(ProposePath(goal=g) for g in goals)
    )


@pytest.mark.parametrize("first", WRITES, ids=WRITE_IDS)
@pytest.mark.parametrize("second", WRITES, ids=WRITE_IDS)
def test_a_second_different_write_in_a_turn_is_refused_and_the_call_says_so(
    first, second
):
    if first == second:
        pytest.skip("the same call twice is answered as already done")
    actions = []
    admit(actions, call(first), ROOM)

    told = admit(actions, call(second), ROOM)

    assert told == refusal(ONE_CHANGE)
    assert actions == [first]


@pytest.mark.parametrize("write", WRITES, ids=WRITE_IDS)
def test_the_same_call_twice_is_answered_as_already_done(write):
    actions = []
    admit(actions, call(write), ROOM)

    told = admit(actions, call(write), ROOM)

    assert told == ALREADY
    assert actions == [write]


@pytest.mark.parametrize("opened", OPENS, ids=OPEN_IDS)
@pytest.mark.parametrize("write", WRITES, ids=WRITE_IDS)
def test_going_somewhere_comes_with_a_write_in_either_order(write, opened):
    """ "Go to Maths and add surds": the open changes nothing, so it takes no slot."""
    actions = []
    admit(actions, call(opened), ROOM)
    assert admit(actions, call(write), ROOM) == {"done": "ok"}
    assert actions == [opened, write]

    actions = []
    admit(actions, call(write), ROOM)
    assert admit(actions, call(opened), ROOM) == {"done": "ok"}
    assert actions == [write, opened]


def test_of_two_opens_the_last_counts_and_a_write_is_kept():
    first, last = OPENS
    write = WRITES[3]
    actions = []

    admit(actions, call(first), ROOM)
    admit(actions, call(write), ROOM)
    admit(actions, call(last), ROOM)

    assert actions == [write, last]


@pytest.mark.parametrize("write", WRITES, ids=WRITE_IDS)
def test_courses_are_refused_after_a_write_and_a_write_after_courses(write):
    actions = []
    admit(actions, call(write), ROOM)
    assert admit(actions, courses("Astronomy"), ROOM) == refusal(ONE_CHANGE)

    actions = []
    admit(actions, courses("Astronomy"), ROOM)
    assert admit(actions, call(write), ROOM) == refusal(ONE_CHANGE)
    assert [type(a) for a in actions] == [ProposePath]


def test_courses_come_with_a_trip_to_a_subject():
    opened = OPENS[0]
    actions = []

    admit(actions, courses("Astronomy"), ROOM)
    admit(actions, call(opened), ROOM)

    assert [type(a) for a in actions] == [ProposePath, OpenSubject]
    assert admit(actions, courses("Chess"), ROOM) == {"shown": "all"}


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
    assert "at most 2 courses" in told["not_offered"]
    assert "C" in told["not_offered"]


@pytest.mark.parametrize("room", [0, -1])
def test_a_full_plan_is_told_to_drop_a_subject_first(room):
    actions = []

    told = admit(actions, courses("A"), room)

    assert told == refusal(FULL)
    assert "drop a subject first" in told["error"]
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

    assert told == ALREADY
    assert len(actions) == 1
