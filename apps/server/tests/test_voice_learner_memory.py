from unittest.mock import AsyncMock, MagicMock

import pytest

from app.voice import learner_memory
from app.voice.learner_memory import (
    assessed_plan,
    remember_assessment,
    weakened_lessons,
)

TABLE_2 = "mathematics.multiplication.table-2"


def turn(event_id: str) -> dict:
    return {"plan_id": TABLE_2, "event_id": event_id, "learner_class": "primary_3"}


def test_only_an_assessment_is_worth_remembering():
    assert assessed_plan(turn("assess")) == TABLE_2
    assert assessed_plan(turn("practice")) is None
    assert assessed_plan(turn("nonesuch")) is None
    assert assessed_plan({"plan_id": "no.such.plan", "event_id": "assess"}) is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "decision,verdict",
    [("correct", "correct"), ("try_again", "wrong"), ("not_understood", "unheard")],
)
async def test_each_marking_reaches_the_memory_model_as_its_own_verdict(
    monkeypatch, decision, verdict
):
    asked = AsyncMock(return_value={"stability": 1.0, "applied": True})
    monkeypatch.setattr(learner_memory, "_ask", asked)
    await remember_assessment(MagicMock(), "owner", "gvm_1", turn("assess"), decision)
    assert asked.await_args.args[2] == "record"
    assert asked.await_args.args[3] == {
        "lesson": "primary_3",
        "item": TABLE_2,
        "verdict": verdict,
        "turn": "gvm_1",
    }


@pytest.mark.asyncio
async def test_practice_never_moves_a_lesson_and_needs_no_call(monkeypatch):
    asked = AsyncMock()
    monkeypatch.setattr(learner_memory, "_ask", asked)
    await remember_assessment(
        MagicMock(), "owner", "gvm_1", turn("practice"), "correct"
    )
    asked.assert_not_awaited()


@pytest.mark.asyncio
async def test_the_weakest_lessons_arrive_in_the_order_the_model_ranked_them(
    monkeypatch,
):
    monkeypatch.setattr(
        learner_memory, "_ask", AsyncMock(return_value={"due": ["b", "a"]})
    )
    assert await weakened_lessons(MagicMock(), "owner", "primary_3") == ("b", "a")


@pytest.mark.asyncio
async def test_a_learner_with_no_class_has_no_lessons_to_review(monkeypatch):
    asked = AsyncMock()
    monkeypatch.setattr(learner_memory, "_ask", asked)
    assert await weakened_lessons(MagicMock(), "owner", None) == ()
    asked.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_check_passed_only_with_help_reaches_the_memory_as_helped(monkeypatch):
    asked = AsyncMock(return_value={"stability": 1.0, "applied": True})
    monkeypatch.setattr(learner_memory, "_ask", asked)
    await remember_assessment(
        MagicMock(), "owner", "gvm_1", turn("assess"), "correct", alone=False
    )
    assert asked.await_args.args[3]["verdict"] == "helped"
    await remember_assessment(
        MagicMock(), "owner", "gvm_2", turn("assess"), "try_again", alone=False
    )
    assert asked.await_args.args[3]["verdict"] == "wrong"
