"""The path card: the courses the tutor plans for a learner, each topic one they can leave out."""

import asyncio

import dspy
import pytest
from workshops import FakePlanner, Limited, paths_shown, workshop

from app.agent import path_card
from app.agent.cards import PATH_DESCRIPTION, PathCard, PathStep, PlannedPath
from app.agent.context import LearnerContext, SubjectRef
from app.agent.courses import earlier_path_in
from app.agent.path_answer import (
    ANSWER_CHARS,
    HEAD,
    answer_size,
    fit_to_answer,
)
from app.agent.path_card import planned_path
from app.agent.title import MAX_GOAL, MAX_LEVEL, MAX_TITLE
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.agent.workshop import GenerationBudget
from app.domains.path.service import MAX_STEPS
from app.turns.job import MAX_MESSAGE_CHARS

PLANNED = LearnerContext(
    planId="plan-1",
    country="Nigeria",
    language="English",
    gradeLevel="JSS 1",
    subjects=[SubjectRef(name="Mathematics", slug="mathematics")],
)


async def propose(planner=None, context=PLANNED, earlier="", shop=None, **arguments):
    outputs = TurnOutputs()
    turn = Turn(
        context,
        "x",
        workshop=shop or workshop(planner),
        earlier_path=earlier,
    )
    tool = next(t for t in tools_for(turn, outputs) if t.__name__ == "propose_path")
    return await dspy.Tool(tool).acall(**arguments), outputs


async def test_each_course_is_planned_and_shown_with_its_topics_in_order():
    planner = FakePlanner()

    told, outputs = await propose(planner, goals=["real analysis", "astronomy"])

    [card] = paths_shown(outputs)
    paths = card.tool_result.structured_content.paths
    assert [p.subject for p in paths] == ["Real Analysis", "Astronomy"]
    assert [s.title for s in paths[0].steps] == [
        "real analysis basics",
        "real analysis",
    ]
    assert paths[0].steps[0].level == "SS 1"
    assert card.tool_input == {"goals": ["real analysis", "astronomy"]}
    assert "Nothing is added yet" in told["done"]
    assert outputs.actions == []


async def test_the_planner_is_asked_for_the_learners_own_country_language_and_class():
    asked = []

    class Planner(FakePlanner):
        async def plan_path(self, country, language, grade_level, goal, revision=None):
            asked.append((country, language, grade_level, goal))
            return await super().plan_path(country, language, grade_level, goal)

    await propose(Planner(), goals=["astronomy"])

    assert asked == [("Nigeria", "English", "JSS 1", "astronomy")]


async def test_a_card_is_never_shown_with_what_the_model_reads_of_its_data():
    told, _ = await propose(goals=["astronomy"])

    assert list(told) == ["done"]
    assert "Astronomy basics" not in str(told)


async def test_a_revision_is_planned_from_the_card_shown_and_what_the_learner_said():
    planner = FakePlanner()
    earlier = f"{PATH_DESCRIPTION}, nothing added yet:\nAstronomy:\n1. Stars (SS 1)"

    await propose(
        planner,
        earlier=earlier,
        goals=["astronomy"],
        changes="  add   black holes\nand drop stars ",
    )

    [(goal, revision)] = planner.asked
    assert goal == "astronomy"
    assert revision.current == earlier
    assert revision.changes == "add black holes and drop stars"


@pytest.mark.parametrize(
    ("earlier", "changes"),
    [("", "add black holes"), ("A path", ""), ("A path", "   ")],
    ids=["no-earlier-path", "no-changes", "blank-changes"],
)
async def test_without_both_a_path_shown_and_a_change_asked_the_path_is_planned_anew(
    earlier, changes
):
    planner = FakePlanner()

    await propose(planner, earlier=earlier, goals=["astronomy"], changes=changes)

    assert planner.asked == [("astronomy", None)]


async def test_what_the_learner_said_is_cut_to_a_sentence_or_two():
    planner = FakePlanner()

    await propose(planner, earlier="A path", goals=["astronomy"], changes="x" * 5000)

    assert len(planner.asked[0][1].changes) == path_card.MAX_CHANGES


async def test_a_course_that_cannot_be_planned_is_told_plainly_and_nothing_is_shown(
    caplog,
):
    told, outputs = await propose(
        FakePlanner(failing=("astronomy",)), goals=["astronomy"]
    )

    assert "could not be planned" in told["error"]
    assert "never say it is below" in told["error"]
    assert outputs.cards == []


async def test_one_course_failing_among_several_shows_the_others_and_says_which_failed():
    told, outputs = await propose(
        FakePlanner(failing=("chess",)), goals=["astronomy", "chess"]
    )

    subjects = [
        p.subject
        for c in paths_shown(outputs)
        for p in c.tool_result.structured_content.paths
    ]
    assert subjects == ["Astronomy"]
    assert "chess" in told["not_planned"]


async def test_a_planner_that_never_answers_is_given_up_on(monkeypatch):
    class Stuck(FakePlanner):
        async def plan_path(self, *args, **kwargs):
            await asyncio.Event().wait()

    monkeypatch.setattr(path_card, "PLAN_SECONDS", 0.01)

    told, outputs = await propose(Stuck(), goals=["astronomy"])

    assert "could not be planned" in told["error"]
    assert outputs.cards == []


async def test_each_plan_spends_the_generation_budget_and_none_is_made_past_it():
    limited = Limited(allowed=2)
    planner = FakePlanner()
    shop = workshop(planner, budget=GenerationBudget(limited, "203.0.113.7"))

    told, outputs = await propose(shop=shop, goals=["astronomy", "chess", "ballet"])

    assert [goal for goal, _ in planner.asked] == ["astronomy", "chess"]
    assert limited.keys == ["203.0.113.7"] * 3
    assert "ballet" in told["not_planned"]
    assert len(paths_shown(outputs)) == 1


async def test_a_budget_spent_before_the_first_plan_makes_nothing():
    limited = Limited(allowed=0)
    planner = FakePlanner()

    told, outputs = await propose(
        shop=workshop(planner, budget=GenerationBudget(limited, "k")),
        goals=["astronomy", "chess"],
    )

    assert planner.asked == []
    assert "busy" in told["error"]
    assert outputs.cards == []


async def test_without_a_workshop_there_is_nothing_to_plan_with():
    outputs = TurnOutputs()
    tool = next(
        t
        for t in tools_for(Turn(PLANNED, "x"), outputs)
        if t.__name__ == "propose_path"
    )

    told = await dspy.Tool(tool).acall(goals=["astronomy"])

    assert "cannot be planned" in told["error"]


def test_a_planned_path_is_cut_and_cleaned_to_what_a_card_shows():
    long = "x" * 500
    raw = {
        "subject": long,
        "steps": [{"title": f"Step {n}", "level": long} for n in range(40)]
        + [{"title": "", "level": "SS 1"}, {"title": "step 1", "level": "SS 2"}],
    }

    path = planned_path(raw, "goal")

    assert path is not None
    assert len(path.subject) == MAX_GOAL
    assert len(path.steps) == MAX_STEPS
    assert all(len(s.level) == MAX_LEVEL for s in path.steps)
    assert all(len(s.title) <= MAX_TITLE for s in path.steps)


def test_a_path_with_no_topic_left_is_no_path_and_a_nameless_one_takes_the_goal():
    assert (
        planned_path({"subject": "A", "steps": [{"title": " ", "level": "x"}]}, "g")
        is None
    )
    named = planned_path({"subject": " ", "steps": [{"title": "T", "level": "x"}]}, "g")
    assert named is not None and named.subject == "g"


def test_the_latest_path_card_among_the_cards_held_is_the_one_to_revise():
    first = f"{PATH_DESCRIPTION}, nothing added yet:\nOne:\n1. A (x)"
    second = f"{PATH_DESCRIPTION}, nothing added yet:\nTwo:\n1. B (y)"

    assert earlier_path_in(["", first, "A question", second, "A button"]) == second
    assert earlier_path_in(["", "A question"]) == ""


def test_a_card_for_a_path_is_a_question_alone_in_its_turn():
    from app.agent.cards import ASKING

    assert PathCard in ASKING


def longest(subject: str) -> PlannedPath:
    steps = [PathStep(title="t" * MAX_TITLE, level="l" * MAX_LEVEL)] * MAX_STEPS
    return PlannedPath(subject=subject, goal=subject, steps=steps)


def test_the_answer_for_a_card_always_fits_a_message():
    assert ANSWER_CHARS <= MAX_MESSAGE_CHARS
    assert answer_size([longest("s" * MAX_GOAL)]) <= ANSWER_CHARS


def test_the_size_of_an_answer_is_at_least_what_the_card_writes():
    path = PlannedPath(
        subject="Chess",
        goal="Chess",
        steps=[PathStep(title="Openings", level="SS 1")],
    )
    written = f"{HEAD}\nCourse: Chess\n- Openings | SS 1"

    assert len(written) <= answer_size([path]) <= len(written) + 3


def test_courses_whose_answer_would_not_fit_a_message_are_left_for_later():
    paths = [longest(f"Course {n}") for n in range(5)]

    shown = fit_to_answer(paths)

    assert shown == paths[:1]


def test_courses_of_an_ordinary_size_are_all_shown():
    ordinary = PlannedPath(
        subject="Quantum computing",
        goal="Quantum computing",
        steps=[
            PathStep(title=f"A topic of the path {n}", level="Undergraduate")
            for n in range(8)
        ],
    )

    assert fit_to_answer([ordinary] * 3) == [ordinary] * 3


def test_one_course_is_always_shown_whatever_its_size():
    assert fit_to_answer([longest("a")]) == [longest("a")]
    assert fit_to_answer([]) == []


async def test_the_courses_the_card_has_no_room_for_are_said_and_not_shown():
    class Wordy(FakePlanner):
        async def plan_path(self, country, language, grade_level, goal, revision=None):
            return {
                "subject": goal,
                "steps": [
                    {"title": f"{goal} {n} " + "w" * 60, "level": "l" * 30}
                    for n in range(12)
                ],
            }

    goals = ["alpha", "beta", "gamma", "delta", "epsilon"]
    told, outputs = await propose(Wordy(), goals=goals)

    [card] = paths_shown(outputs)
    shown = card.tool_result.structured_content.paths
    assert 1 <= len(shown) < 5
    assert "not_offered_yet" in told
    assert goals[len(shown) - 1] not in told["not_offered_yet"]
    assert goals[len(shown)] in told["not_offered_yet"]
