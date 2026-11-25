"""The choice card: a short question with a few answers to tap."""

import dspy
import pytest

from app.agent.context import LearnerContext
from app.agent.toolkit import Turn, TurnOutputs, tools_for


def run(name: str, context: LearnerContext | None = None, **arguments):
    """A tool as the model calls it: what it reads back, and the card the turn kept."""
    outputs = TurnOutputs()
    tool = next(
        tool
        for tool in tools_for(Turn(context or LearnerContext(), ""), outputs)
        if tool.__name__ == name
    )
    return dspy.Tool(tool)(**arguments), outputs.cards


def test_a_question_and_its_answers_reach_the_app_as_one_card():
    told, [card] = run(
        "give_choice", question="Which class are you in?", options=["JSS 1", "JSS 2"]
    )

    assert card.resource_uri == "ui://graspy/choice"
    assert card.tool_result.structured_content.model_dump() == {
        "question": "Which class are you in?",
        "options": ["JSS 1", "JSS 2"],
    }
    assert "as a card below your answer" in told["done"]


def test_answers_are_cleaned_and_never_repeated():
    _, [card] = run(
        "give_choice",
        question="  Which  one? ",
        options=["Maths", "Maths", " ", "Science"],
    )

    assert card.tool_result.structured_content.question == "Which one?"
    assert card.tool_result.structured_content.options == ["Maths", "Science"]


@pytest.mark.parametrize(
    ("question", "options"),
    [
        (" ", ["A", "B"]),
        ("Which?", ["A"]),
        ("Which?", ["A", "A"]),
        ("Which?", ["A", "B", "C", "D", "E"]),
    ],
)
def test_a_choice_that_cannot_be_shown_is_refused_and_no_card_is_kept(
    question, options
):
    told, cards = run("give_choice", question=question, options=options)

    assert "Nothing was done." in told["error"]
    assert cards == []
