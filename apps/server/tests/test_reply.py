"""What of a turn's actions reaches the app."""

from app.agent.reply import (
    AddTopic,
    OpenSubject,
    OpenTopic,
    ProposePath,
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
