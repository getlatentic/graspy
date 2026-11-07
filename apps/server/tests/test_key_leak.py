"""A hint or a wrong-answer note is read before the learner has the answer, so
a card whose hint or note states the answer is refused and rewritten."""

import pytest
from test_passage_tool import asked
from test_passage_tool import give as give_passage
from test_practice_tool import give


@pytest.mark.parametrize("field", ["hint", "incorrect_feedback"])
@pytest.mark.parametrize(
    "text",
    [
        "The answer is 0.325.",
        "13 divided by 40 is .325",
        "It comes to \\(0.325\\).",
        "Divide 13 by 40 and you reach 0.3250.",
    ],
)
def test_a_practice_note_that_states_the_answer_is_sent_back(field, text):
    result, cards = give(**{field: text})

    assert "gives away the right answer" in result["error"]
    assert field in result["error"]
    assert cards == []


@pytest.mark.parametrize(
    ("overrides", "text"),
    [
        (
            {
                "question": "What is 7/8 as a percentage?",
                "options": ["87.5%", "78%", "8.75%"],
                "working": "7 / 8 = 0.875, so 87.5%",
            },
            "It is 87.5%.",
        ),
        (
            {
                "question": "Which gas do plants take in?",
                "options": ["Carbon dioxide", "Oxygen", "Helium"],
                "working": "Plants take in carbon dioxide.",
            },
            "Think of the gas called carbon dioxide.",
        ),
    ],
)
def test_the_answer_is_found_as_a_percentage_or_in_words(overrides, text):
    result, _ = give(hint=text, **overrides)

    assert "gives away the right answer" in result["error"]


@pytest.mark.parametrize(
    "text",
    ["Write it as 13 ÷ 40.", "Divide the top by the bottom.", ""],
)
def test_a_note_that_only_points_to_the_method_is_shown(text):
    result, cards = give(hint=text, incorrect_feedback=text)

    assert "error" not in result
    assert len(cards) == 1


def test_a_number_the_question_already_gives_is_not_the_answer_given_away():
    """The answer is 2, and the question says 'by 2'."""
    result, cards = give(
        question="Share 10 sweets equally between 5 children. How many each?",
        working="10 / 5 = 2",
        options=["2", "5", "50"],
        check="10/5",
        hint="Divide 10 by 5.",
    )

    assert "error" not in result and len(cards) == 1


def test_a_passage_note_that_states_the_answer_is_sent_back():
    result, cards = give_passage([asked(hint="Ada takes Three baskets.")])

    assert "gives away the right answer" in result["error"]
    assert cards == []


def test_a_passage_note_may_point_at_the_passage_without_the_answer():
    result, cards = give_passage([asked(hint="Read the sentence about the bus.")])

    assert "error" not in result and len(cards) == 1
