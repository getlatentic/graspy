"""Which of the learner's subjects a name means. A wrong duplicate is
recoverable and a wrong removal is not, so everything doubtful is a new subject
for adding and "no such subject" for dropping."""

import time

import pytest

from app.agent.subject_match import candidates, normalise


def named(wanted: str, *held: str) -> list[str]:
    return [held[i] for i in candidates(wanted, list(held))]


@pytest.mark.parametrize(
    ("wanted", "held", "means"),
    [
        ("Mathematics", ["Mathematics"], "Mathematics"),
        ("  MATHEMATICS ", ["Mathematics"], "Mathematics"),
        ("mathematics!", ["Mathematics"], "Mathematics"),
        ("Géographie", ["Geographie"], "Geographie"),
        ("Español", ["espanol"], "espanol"),
        ("Maths", ["Mathematics"], "Mathematics"),
        ("math", ["Mathematics"], "Mathematics"),
        ("Mathematics", ["Maths"], "Maths"),
        ("Maths", ["Further Mathematics", "Mathematics"], "Mathematics"),
        ("eng", ["English Language"], "English Language"),
        ("English", ["English Language"], "English Language"),
        ("english", ["English Language", "Mathematics"], "English Language"),
        ("computing", ["Computer Science"], "Computer Science"),
        (
            "ICT",
            ["Information and Communication Technology"],
            "Information and Communication Technology",
        ),
        ("PE", ["Physical Education"], "Physical Education"),
        ("P.E.", ["Physical Education"], "Physical Education"),
        ("RE", ["Religious Education"], "Religious Education"),
        ("bio", ["Biology"], "Biology"),
        ("chem", ["Chemistry"], "Chemistry"),
        ("phy", ["Physical Education", "Physics"], "Physics"),
        ("phys", ["Physics"], "Physics"),
        ("geo", ["Geography"], "Geography"),
        ("hist", ["History"], "History"),
        ("Mathmatics", ["Mathematics"], "Mathematics"),
        ("Matematics", ["Mathematics"], "Mathematics"),
    ],
)
def test_a_name_that_is_one_subject_they_hold(wanted, held, means):
    assert named(wanted, *held) == [means]


@pytest.mark.parametrize(
    ("wanted", "held"),
    [
        # A bare word is not a longer name that holds it.
        ("Mathematics", ["Further Mathematics"]),
        ("Economics", ["Home Economics"]),
        ("Science", ["Basic Science"]),
        ("Literature", ["English Literature"]),
        ("Computer Science", ["Science"]),
        # A prefix qualifier or a longer name is another subject.
        ("Quantum Physics", ["Physics"]),
        ("Physics", ["Quantum Physics"]),
        ("Organic Chemistry", ["Chemistry"]),
        ("World History", ["History"]),
        ("Linear Algebra", ["Algebra"]),
        ("Mathematics of machine learning", ["Mathematics"]),
        ("Mathematics for machine learning", ["Mathematics"]),
        # A level is another course.
        ("Physics 2", ["Physics"]),
        ("Physics", ["Physics 2"]),
        ("Mathematics II", ["Mathematics"]),
        ("Maths 3", ["Mathematics 2"]),
        ("Year 7 Maths", ["Year 8 Maths"]),
        ("Grade 7", ["Grade 8"]),
        ("Maths A", ["Maths B"]),
        # Near is not the same.
        ("Chemistry", ["Biochemistry"]),
        ("Biochemistry", ["Chemistry"]),
        ("Java", ["JavaScript"]),
        ("Art", ["Arts"]),
        ("Physics", ["Physical Education"]),
        ("Mathematic", ["Mathematics"]),
        ("Chemestry", ["Chemistry"]),
        ("Mathematics 1", ["Mathematics 2"]),
        # Unknown.
        ("Astronomy", ["Mathematics", "Physics"]),
        ("", ["Physics"]),
        ("!!!", ["Physics"]),
    ],
)
def test_a_name_that_is_none_of_the_subjects_they_hold(wanted, held):
    assert named(wanted, *held) == []


@pytest.mark.parametrize(
    ("wanted", "held"),
    [
        ("english", ["English Language", "English Literature"]),
        ("eng", ["English Language", "English Literature"]),
        ("computing", ["ICT", "Computer Science"]),
        ("Maths", ["Maths", "maths"]),
        ("Physics", ["Physics", "physics"]),
    ],
)
def test_a_name_that_could_be_more_than_one_is_all_of_them(wanted, held):
    assert named(wanted, *held) == held


def test_an_abbreviation_means_only_a_subject_they_hold():
    assert named("maths", "Physics") == []
    assert named("english literature", "English Language") == []


def test_the_exactly_spelled_subject_wins_over_an_abbreviation():
    assert named("English", "English Language", "English") == ["English"]


def test_a_name_is_cut_before_it_is_compared():
    start = time.perf_counter()
    huge = "mathematics " * 40_000

    assert candidates(huge, ["Mathematics", "Physics"]) == []
    assert time.perf_counter() - start < 0.5
    assert len(normalise(huge)) <= 80


def test_normalising_folds_case_accents_spacing_and_punctuation():
    assert normalise("  Éducation   Physique,  et Sportive! ") == (
        "education physique et sportive"
    )
