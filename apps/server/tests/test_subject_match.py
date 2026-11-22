"""Which names are a subject the learner has, for adding and for dropping alike."""

import pytest

from app.agent.subject_match import find_subject, same_subject


@pytest.mark.parametrize(
    ("wanted", "held"),
    [
        ("Mathematics", "Mathematics"),
        ("mathematics", "MATHEMATICS"),
        ("Maths", "Mathematics"),
        ("math", "Mathematics"),
        ("Mathematic", "Mathematics"),
        ("english", "English Language"),
        ("English", "English Language"),
        ("science", "Basic Science"),
        ("Physic", "Physics"),
        ("Maths 2", "Mathematics 2"),
        ("Mathematics II", "Mathematics ii"),
        ("Basic Sciences", "Basic Science"),
    ],
)
def test_a_name_that_is_a_subject_of_theirs(wanted, held):
    assert same_subject(wanted, held)


@pytest.mark.parametrize(
    ("wanted", "held"),
    [
        ("Mathematics of machine learning", "Mathematics"),
        ("Mathematics for machine learning", "Mathematics"),
        ("Physics 2", "Physics"),
        ("Physics", "Physics 2"),
        ("Mathematics II", "Mathematics"),
        ("Maths 3", "Mathematics 2"),
        ("Physics", "Physical Education"),
        ("Quantum computing", "Computer Science"),
        ("Chemistry", "Physics"),
        ("", "Physics"),
    ],
)
def test_a_name_that_is_another_subject(wanted, held):
    assert not same_subject(wanted, held)


def test_the_exactly_spelled_subject_is_found_before_a_looser_one():
    names = ["English Language", "English"]

    assert find_subject("english", names) == 1


def test_no_subject_is_found_for_a_name_that_matches_none():
    assert find_subject("Astronomy", ["Mathematics", "Physics"]) is None
