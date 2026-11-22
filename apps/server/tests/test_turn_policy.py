"""What of a turn's tool calls reaches the app, and what each call is told."""

import pytest

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
from app.agent.turn_policy import admit


def call(*actions, told=None) -> Outcome:
    return Outcome(told=told or {"done": "ok"}, actions=tuple(actions))


def courses(*goals: str) -> Outcome:
    return call(*(ProposePath(goal=goal) for goal in goals), told={"shown": "all"})


def test_of_two_opens_in_a_turn_the_last_counts():
    first = OpenSubject(subject_slug="a", subject="A")
    last = OpenTopic(subject_slug="b", topic_index=0, topic="T")
    actions = []

    admit(actions, call(first))
    admit(actions, call(last))

    assert actions == [last]


def test_an_earlier_change_of_subjects_is_not_lost_to_a_later_open_or_topic():
    change = ChangeSubjects(add=["Chess"], remove=[])
    opened = OpenSubject(subject_slug="a", subject="A")
    added = AddTopic(subject_slug="a", subject="A", topic="Surds")
    actions = []

    admit(actions, call(change))
    admit(actions, call(opened))
    admit(actions, call(added))

    assert actions == [change, opened, added]


def test_each_course_is_kept_once_whatever_its_case_spacing_or_accents():
    actions = []

    told = admit(
        actions, courses("Quantum  computing", "quantum COMPUTING", "Géologie")
    )
    again = admit(actions, courses("geologie", "Astronomy"))

    assert [a.goal for a in actions] == ["Quantum  computing", "Géologie", "Astronomy"]
    assert "Quantum  computing and Géologie" in told["shown"]
    assert "Astronomy" in again["shown"]
    assert "geologie" not in again["shown"]


def test_courses_across_calls_stop_at_the_cap_and_the_model_is_told_which():
    actions = []
    admit(actions, courses(*[f"Course {n}" for n in range(4)]))

    told = admit(actions, courses("Course 4", "Course 5", "Course 6"))

    assert len(actions) == MAX_PATH_GOALS
    assert "Course 5 and Course 6" in told["not_offered"]
    assert "Course 5" not in told["shown"]


def test_a_call_with_only_courses_over_the_cap_is_refused():
    actions = []
    admit(actions, courses(*[f"Course {n}" for n in range(MAX_PATH_GOALS)]))

    told = admit(actions, courses("One more"))

    assert "error" in told
    assert len(actions) == MAX_PATH_GOALS


def test_courses_already_offered_say_so_and_add_nothing():
    actions = []
    admit(actions, courses("Astronomy"))

    told = admit(actions, courses("astronomy"))

    assert "already offered" in told["note"]
    assert len(actions) == 1


@pytest.mark.parametrize(
    "confirming",
    [RebuildPlan(), ChangeSubjects(add=[], remove=["History"])],
    ids=["rebuild", "drop"],
)
def test_courses_asked_after_a_confirmation_are_refused_with_the_reason(confirming):
    actions = []
    admit(actions, call(confirming))

    told = admit(actions, courses("Astronomy"))

    assert "confirm" in told["error"]
    assert actions == [confirming]


@pytest.mark.parametrize(
    "confirming",
    [RebuildPlan(), ChangeSubjects(add=[], remove=["History"])],
    ids=["rebuild", "drop"],
)
def test_courses_offered_before_a_confirmation_are_withdrawn_and_the_call_says_so(
    confirming,
):
    actions = []
    admit(actions, courses("Astronomy", "Chess"))

    told = admit(actions, call(confirming))

    assert actions == [confirming]
    assert "withdrawn" in told["note"]


def test_an_add_only_change_keeps_the_courses():
    change = ChangeSubjects(add=["Chess"], remove=[])
    actions = []
    admit(actions, courses("Astronomy"))

    admit(actions, call(change))

    assert [type(a) for a in actions] == [ProposePath, ChangeSubjects]


def test_changes_of_subjects_in_one_turn_are_one_change():
    actions = []

    admit(actions, call(ChangeSubjects(add=["Astronomy"], remove=[])))
    admit(actions, call(ChangeSubjects(add=["Chess", "ASTRONOMY"], remove=["History"])))

    assert actions == [ChangeSubjects(add=["Astronomy", "Chess"], remove=["History"])]


def test_a_subject_added_and_dropped_in_one_turn_is_left_as_it_was():
    actions = []
    admit(actions, call(ChangeSubjects(add=["Chess"], remove=[])))

    told = admit(actions, call(ChangeSubjects(add=[], remove=["chess"])))

    assert actions == []
    assert "nothing is done" in told["note"]


def test_a_subject_dropped_and_then_added_in_one_turn_stays_and_is_not_removed():
    """Remove X then add X must not delete what the learner asked to add."""
    actions = []
    admit(actions, call(ChangeSubjects(add=[], remove=["Physics"])))

    told = admit(actions, call(ChangeSubjects(add=["PHYSICS"], remove=[])))

    assert actions == []
    assert "it stays" in told["note"]
