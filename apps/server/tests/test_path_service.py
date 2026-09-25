"""Planning a learning path: each step keeps its own level."""

import pytest
from stand_in import inputs, stand_in

from app.domains.path.service import MAX_STEPS, LearningPathService


def plan_answer(name: str, *steps: tuple[str, str]) -> dict:
    return {
        "reasoning": "r",
        "subject_name": name,
        "steps": [{"title": title, "level": level} for title, level in steps],
    }


async def plan(answers: list[dict], language: str = "English") -> tuple[dict, object]:
    lm, context = stand_in(answers)
    with context:
        result = await LearningPathService().plan_path(
            "Nigeria", language, "JSS 1", "real analysis"
        )
    return result, lm


async def test_each_step_keeps_its_own_level_in_order():
    result, lm = await plan(
        [plan_answer("Real analysis", ("Fractions", "JSS 1"), ("Limits", "SS 3"))]
    )

    assert result == {
        "subject": "Real analysis",
        "goal": "real analysis",
        "steps": [
            {"title": "Fractions", "level": "JSS 1"},
            {"title": "Limits", "level": "SS 3"},
        ],
    }
    assert inputs(lm, 0)["grade_level"] == "JSS 1"
    assert inputs(lm, 0)["goal"] == "real analysis"


async def test_repeated_and_blank_steps_are_dropped_and_the_path_is_capped():
    steps = [("Limits", "SS 3"), ("  limits ", "SS 3"), ("", "SS 3")] + [
        (f"Step {i}", "SS 3") for i in range(20)
    ]

    result, _ = await plan([plan_answer("Real analysis", *steps)])

    titles = [step["title"] for step in result["steps"]]
    assert titles[0] == "Limits" and titles.count("Limits") == 1
    assert len(titles) == MAX_STEPS


async def test_a_translated_path_names_and_titles_in_the_learners_language():
    answers = [
        plan_answer("Real analysis", ("Fractions", "JSS 1"), ("Limits", "SS 3")),
        {"reasoning": "r", "translated_topics": ["Ìtúpalẹ̀ gidi", "Ìdá", "Ààlà"]},
    ]

    result, lm = await plan(answers, language="Yoruba")

    assert result["subject"] == "Ìtúpalẹ̀ gidi"
    assert result["steps"] == [
        {"title": "Ìdá", "level": "JSS 1"},
        {"title": "Ààlà", "level": "SS 3"},
    ]
    assert inputs(lm, 0)["language"] == "English"


async def test_a_translation_of_the_wrong_length_keeps_the_original():
    answers = [
        plan_answer("Real analysis", ("Fractions", "JSS 1"), ("Limits", "SS 3")),
        {"reasoning": "r", "translated_topics": ["Ìtúpalẹ̀ gidi", "Ìdá"]},
    ]

    result, _ = await plan(answers, language="Yoruba")

    assert [step["title"] for step in result["steps"]] == ["Fractions", "Limits"]


async def test_a_path_with_no_steps_is_an_error():
    with pytest.raises(ValueError):
        await plan([plan_answer("Real analysis")])
