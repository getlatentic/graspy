"""What the learner chose on a path card, read back from the message the card sends."""

import pytest

from app.agent.context import LearnerContext, SubjectRef
from app.agent.path_answer import (
    HEAD,
    MAX_STEPS,
    describe_added,
    path_answer,
)
from app.agent.reply import MAX_PATH_GOALS
from app.agent.title import MAX_GOAL, MAX_LEVEL, MAX_TITLE
from app.utils.slug import slugify

PLANNED = LearnerContext(
    planId="plan-1",
    country="Nigeria",
    language="English",
    gradeLevel="JSS 1",
    subjects=[SubjectRef(name="Mathematics", slug="mathematics")],
)


def card_answer(*courses: tuple[str, list[str]]) -> str:
    lines = [HEAD]
    for name, steps in courses:
        lines.append(f"Course: {name}")
        lines.extend(f"- {step}" for step in steps)
    return "\n".join(lines)


def test_the_courses_and_the_topics_kept_are_read_in_the_order_the_card_wrote_them():
    message = card_answer(
        ("Real analysis", ["Limits | SS 3", "Sequences | Undergraduate"]),
        ("Quantum computing", ["Qubits"]),
    )

    added = path_answer(message, PLANNED)

    assert added is not None
    first, second = added.paths
    assert (first.subject, first.slug) == ("Real analysis", "real-analysis")
    assert [(s.title, s.level) for s in first.steps] == [
        ("Limits", "SS 3"),
        ("Sequences", "Undergraduate"),
    ]
    assert [(s.title, s.level) for s in second.steps] == [("Qubits", "")]


@pytest.mark.parametrize(
    "message",
    [
        "Add to my plan",
        "Add this path please",
        "Course: Real analysis\n- Limits",
        f"{HEAD}\nCourse: Real analysis\nand also this",
        f"{HEAD}\n- Limits",
        f"{HEAD}",
        f"{HEAD}\nCourse: Real analysis",
        "",
    ],
    ids=[
        "no-colon",
        "words",
        "no-head",
        "stray-line",
        "topic-before-course",
        "nothing-chosen",
        "course-without-topics",
        "empty",
    ],
)
def test_anything_else_is_left_to_the_tutor(message):
    assert path_answer(message, PLANNED) is None


def test_a_course_the_learner_has_is_not_added_again_whatever_its_spelling():
    message = card_answer(("Maths", ["Surds"]), ("Chess", ["Openings"]))

    added = path_answer(message, PLANNED)

    assert added is not None
    assert [p.subject for p in added.paths] == ["Chess"]


def test_a_course_named_twice_in_one_message_is_added_once():
    message = card_answer(("Chess", ["Openings"]), ("chess", ["Endings"]))

    added = path_answer(message, PLANNED)

    assert added is not None
    assert [p.subject for p in added.paths] == ["Chess"]


def test_a_slug_the_plan_holds_is_not_taken_again_but_numbered():
    held = PLANNED.model_copy(
        update={"subjects": [SubjectRef(name="Other", slug="chess")]}
    )

    added = path_answer(card_answer(("Chess", ["Openings"])), held)

    assert added is not None
    assert added.paths[0].slug == "chess-2"


def test_the_slug_is_the_one_the_app_makes_of_the_name():
    added = path_answer(card_answer(("Pré-calcul été", ["Limites"])), PLANNED)

    assert added is not None
    assert added.paths[0].slug == slugify("Pré-calcul été")


def test_the_courses_the_plan_has_no_room_for_are_left_out():
    many = PLANNED.model_copy(
        update={
            "subjects": [SubjectRef(name=f"S {n}", slug=f"s{n}") for n in range(14)]
        }
    )

    added = path_answer(card_answer(("A", ["x"]), ("B", ["y"])), many)

    assert added is not None
    assert [p.subject for p in added.paths] == ["A"]


def test_a_full_plan_adds_nothing():
    full = PLANNED.model_copy(
        update={
            "subjects": [SubjectRef(name=f"S {n}", slug=f"s{n}") for n in range(15)]
        }
    )

    assert path_answer(card_answer(("A", ["x"])), full) is None


def test_no_more_courses_than_a_turn_offers_and_no_more_topics_than_a_path_has():
    message = card_answer(
        *[(f"Course {n}", [f"Topic {t}" for t in range(30)]) for n in range(9)]
    )

    added = path_answer(message, LearnerContext(planId="p"))

    assert added is not None
    assert len(added.paths) == MAX_PATH_GOALS
    assert all(len(p.steps) == MAX_STEPS for p in added.paths)


def test_a_topic_listed_twice_is_kept_once():
    added = path_answer(
        card_answer(("Chess", ["Openings", "openings", "Endings"])), PLANNED
    )

    assert added is not None
    assert [s.title for s in added.paths[0].steps] == ["Openings", "Endings"]


def test_names_titles_and_levels_are_cut_and_made_one_line():
    long = "x" * 500
    controls = "\u0000" + chr(0x202E)
    message = (
        f"{HEAD}\nCourse: {long}\n- {long} | {long}\n- Two{controls} lines |  SS   3 "
    )

    added = path_answer(message, PLANNED)

    assert added is not None
    [path] = added.paths
    assert len(path.subject) == MAX_GOAL
    assert len(path.steps[0].title) == MAX_TITLE
    assert len(path.steps[0].level) == MAX_LEVEL
    assert path.steps[1].title == "Two lines"
    assert path.steps[1].level == "SS 3"


def test_a_message_of_thousands_of_lines_is_read_to_its_caps_not_beyond():
    message = HEAD + "".join(f"\nCourse: C{n}\n- topic" for n in range(5000))

    added = path_answer(message, LearnerContext(planId="p"))

    assert added is not None
    assert len(added.paths) == MAX_PATH_GOALS


def test_the_tutor_is_told_what_was_chosen_and_to_start_one_lesson_and_not_to_say_it_is_ready():
    added = path_answer(
        card_answer(("Real analysis", ["Limits", "Sequences"])), PLANNED
    )

    told = describe_added(added)

    assert "Real analysis (Limits, Sequences)" in told
    assert "start_lesson" in told
    assert "Never say it is ready before it returns" in told
