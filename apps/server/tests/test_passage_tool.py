"""Reading practice: the passage card, and the questions it refuses."""

import dspy
import pytest

from app.agent.context import LearnerContext
from app.agent.toolkit import Turn, TurnOutputs, tools_for

PASSAGE = (
    "Ada sells tomatoes at Oja Oba market in Akure every Saturday.\n\n"
    "She wakes before dawn, loads three baskets onto a bus, and reaches the "
    "market by six. Her best customer is Mr Bello, who buys a whole basket "
    "for his restaurant. By noon the baskets are empty and Ada counts her "
    "money: nine thousand naira on a good day."
)


def asked(**overrides) -> dict:
    return {
        "question": "How many baskets does Ada take to market?",
        "evidence": "loads three baskets onto a bus",
        "options": ["Two", "Three", "Four"],
        "answer_index": 1,
        "correct_feedback": "The passage says she loads three baskets.",
        "incorrect_feedback": "Look at what she loads onto the bus.",
        **overrides,
    }


def give(questions=None, **overrides):
    """A passage as the model sets it, through DSPy's tool: what the model
    reads back, and the cards the turn gathered, as sent."""
    outputs = TurnOutputs()
    tool = next(
        tool
        for tool in tools_for(Turn(LearnerContext(), ""), outputs)
        if tool.__name__ == "give_passage"
    )
    fields = {
        "instruction": "Read the passage, then answer.",
        "title": "Market Day",
        "passage": PASSAGE,
        "questions": questions or [asked()],
        **overrides,
    }
    result = dspy.Tool(tool)(**fields)
    return result, [
        card.tool_result.structured_content.model_dump(by_alias=True)
        for card in outputs.cards
    ]


def test_the_passage_and_its_questions_reach_the_app_as_one_card():
    result, [card] = give(
        [
            asked(),
            asked(
                question="Who is her best customer?",
                evidence="Mr Bello",
                options=["Mr Bello", "Ada", "A driver"],
                answer_index=0,
            ),
        ]
    )

    assert card["title"] == "Market Day"
    # Paragraphs are the reader's; they are kept as written.
    assert card["passage"] == PASSAGE
    assert [q["question"] for q in card["questions"]] == [
        "How many baskets does Ada take to market?",
        "Who is her best customer?",
    ]
    assert "Never write the passage" in result["done"]


def test_evidence_matches_whatever_the_spacing_and_case():
    _, cards = give([asked(evidence="Loads  three\nbaskets")])

    assert len(cards) == 1


def test_a_question_the_passage_does_not_answer_is_refused():
    result, cards = give([asked(), asked(evidence="Ada loves mangoes")])

    assert result["error"].startswith("Question 2: The evidence")
    assert cards == []


@pytest.mark.parametrize(
    ("overrides", "problem"),
    [
        ({"passage": "Too short."}, "Write a passage of 200"),
        ({"passage": "x " * 2100}, "Write a passage of 200"),
        ({"title": "  "}, "needs a title"),
        ({"questions": [asked(options=["Three"])]}, "between 2 and 5"),
    ],
)
def test_a_passage_that_cannot_be_shown_is_sent_back(overrides, problem):
    result, cards = give(**overrides)

    assert problem in result["error"]
    assert cards == []
