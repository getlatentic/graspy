"""What of a turn's actions reaches the app."""

import pytest

from app.agent.reply import (
    MAX_PATH_GOALS,
    AddTopic,
    ChangeSubjects,
    OpenSubject,
    OpenTopic,
    ProposePath,
    RebuildPlan,
    actions_for_app,
)


def test_of_two_opens_in_one_turn_the_last_counts():
    first = OpenSubject(subject_slug="a", subject="A")
    last = OpenTopic(subject_slug="b", topic_index=0, topic="T")

    assert actions_for_app([first, last]) == [last]


def test_every_course_proposed_in_a_turn_counts():
    courses = [ProposePath(goal="ML"), ProposePath(goal="Quantum computing")]

    assert actions_for_app(courses) == courses


def test_a_topic_added_beside_courses_is_kept_and_comes_first():
    added = AddTopic(subject_slug="m", subject="Maths", topic="Surds")
    courses = [ProposePath(goal="ML"), ProposePath(goal="Quantum computing")]

    assert actions_for_app([courses[0], added, courses[1]]) == [added, *courses]


def test_a_turn_without_actions_sends_none():
    assert actions_for_app([]) == []


def test_a_turn_offers_no_more_courses_than_the_cap_and_each_once():
    asked = [ProposePath(goal=f"Course {n % 6}") for n in range(15)]
    asked += [ProposePath(goal=f"COURSE {n}") for n in range(8)]

    sent = actions_for_app(asked)

    assert len(sent) == MAX_PATH_GOALS
    assert [a.goal.casefold() for a in sent] == [
        f"course {n}" for n in range(MAX_PATH_GOALS)
    ]


def test_changes_of_subjects_in_one_turn_are_merged():
    first = ChangeSubjects(add=["Astronomy"], remove=[])
    second = ChangeSubjects(add=["Chess", "Astronomy"], remove=["History"])

    assert actions_for_app([first, second]) == [
        ChangeSubjects(add=["Astronomy", "Chess"], remove=["History"])
    ]


def test_a_subject_added_then_dropped_in_one_turn_is_only_dropped():
    adds = ChangeSubjects(add=["Chess"], remove=[])
    drops = ChangeSubjects(add=[], remove=["Chess"])

    assert actions_for_app([adds, drops]) == [ChangeSubjects(add=[], remove=["Chess"])]


def test_a_change_of_subjects_that_is_not_the_last_action_is_left_out():
    change = ChangeSubjects(add=["Chess"], remove=[])
    opened = OpenSubject(subject_slug="a", subject="A")

    assert actions_for_app([change, opened]) == [opened]


@pytest.mark.parametrize(
    "confirming",
    [RebuildPlan(), ChangeSubjects(add=[], remove=["History"])],
    ids=["rebuild", "drop"],
)
def test_courses_are_not_sent_with_a_change_that_asks_to_confirm(confirming):
    sent = actions_for_app([ProposePath(goal="ML"), confirming, ProposePath(goal="X")])

    assert sent == [confirming]


def test_an_add_only_change_does_not_hide_the_courses():
    change = ChangeSubjects(add=["Chess"], remove=[])
    course = ProposePath(goal="ML")

    assert actions_for_app([change, course]) == [change, course]
