"""Which of the learner's subjects a name means. A wrong duplicate is
recoverable and a wrong removal is not, so everything doubtful is a new subject
for adding and "no such subject" for dropping."""

import json
import time
from pathlib import Path

import pytest

from app.agent.subject_match import candidates, normalise

CORPUS = Path(__file__).parents[2] / "web/src/features/learn/lib/name-key-corpus.json"


def named(wanted: str, *held: str) -> list[str]:
    return [held[i] for i in candidates(wanted, list(held))]


@pytest.mark.parametrize(
    "case", json.loads(CORPUS.read_text()), ids=lambda c: c["key"][:20]
)
def test_the_key_of_a_name_is_the_one_the_web_app_makes(case):
    """The web app's nameKey is tested against the same file."""
    assert normalise(case["name"]) == case["key"]


@pytest.mark.parametrize(
    ("wanted", "held", "means"),
    [
        ("Mathematics", ["Mathematics"], "Mathematics"),
        ("  MATHEMATICS ", ["Mathematics"], "Mathematics"),
        ("mathematics!", ["Mathematics"], "Mathematics"),
        ("Géographie", ["Geographie"], "Geographie"),
        ("Español", ["espanol"], "espanol"),
        ("Pre-calculus", ["Precalculus"], "Precalculus"),
        ("Precalculus", ["Pre-calculus"], "Pre-calculus"),
        ("Łódź History", ["Lodz History"], "Lodz History"),
        ("हिन्दी", ["हिन्दी"], "हिन्दी"),
        ("Maths", ["Mathematics"], "Mathematics"),
        ("math", ["Mathematics"], "Mathematics"),
        ("Maths", ["Further Mathematics", "Mathematics"], "Mathematics"),
        (
            "Further Maths",
            ["Mathematics", "Further Mathematics"],
            "Further Mathematics",
        ),
        ("eng", ["English Language"], "English Language"),
        ("English", ["English Language"], "English Language"),
        (
            "english",
            ["English as a Second Language", "Mathematics"],
            "English as a Second Language",
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
    ],
)
def test_a_name_that_is_one_subject_they_hold(wanted, held, means):
    assert named(wanted, *held) == [means]


@pytest.mark.parametrize(
    ("wanted", "held"),
    [
        # A full name matches only itself, in both directions.
        ("English Language", ["English Literature"]),
        ("English Literature", ["English Language"]),
        ("English Language", ["English as a Second Language"]),
        ("English as a Second Language", ["English Language"]),
        ("English Language", ["English Language Arts"]),
        ("English Language Arts", ["English Language"]),
        ("English Language", ["English Literature", "English Language Arts"]),
        # The full name does not stand for a held abbreviation.
        ("Mathematics", ["Maths"]),
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
        ("Mathematics 1", ["Mathematics 2"]),
        # A misspelling is a new subject, never a held one.
        ("Macroeconomics", ["Microeconomics"]),
        ("Ethnology", ["Ethology"]),
        ("Electromagnetics", ["Electromagnetism"]),
        ("Chemistry", ["Biochemistry"]),
        ("Biochemistry", ["Chemistry"]),
        ("Java", ["JavaScript"]),
        ("Art", ["Arts"]),
        ("Physics", ["Physical Education"]),
        ("Mathmatics", ["Mathematics"]),
        ("Mathematic", ["Mathematics"]),
        # ICT, computing and computer science are not told apart by a table.
        ("ICT", ["Computer Science"]),
        ("Computer Science", ["ICT"]),
        ("computing", ["Computer Science"]),
        # Other scripts keep their vowel signs.
        ("हिन्दी", ["हन्द"]),
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
        ("Maths", ["Maths", "maths"]),
        ("Physics", ["Physics", "physics"]),
    ],
)
def test_a_name_that_could_be_more_than_one_is_all_of_them(wanted, held):
    assert named(wanted, *held) == held


def test_an_abbreviation_means_only_a_subject_they_hold():
    assert named("maths", "Physics") == []
    assert named("english", "Mathematics") == []


def test_the_exactly_spelled_subject_wins_over_an_abbreviation():
    assert named("English", "English Language", "English") == ["English"]


def test_a_huge_name_costs_no_more_than_a_long_one():
    """The name is cut before it is compared, so 4 times the length takes about
    as long, not 4 times."""
    held = ["Mathematics", "Physics"]

    def took(length: int) -> float:
        name = "mathematics " * (length // 12)
        start = time.perf_counter()
        for _ in range(3):
            candidates(name, held)
        return time.perf_counter() - start

    took(10_000)
    small, large = (
        min(took(100_000) for _ in range(5)),
        min(took(400_000) for _ in range(5)),
    )

    assert large < small * 2 + 0.005
    assert len(normalise("x" * 400_000)) == 80
