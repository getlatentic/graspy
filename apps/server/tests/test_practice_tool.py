"""The practice card's question: what reaches the app, and what the model is
told to fix when its question cannot be shown."""

import dspy
import pytest

from app.agent.context import LearnerContext
from app.agent.toolkit import Turn, TurnOutputs, tools_for


def practice_tool(outputs: TurnOutputs):
    return next(
        tool
        for tool in tools_for(Turn(LearnerContext(), ""), outputs)
        if tool.__name__ == "give_practice"
    )


def written(**overrides) -> dict:
    """One question as the model writes it."""
    return {
        "question": "Convert \\(\\frac{13}{40}\\) to a decimal.",
        "working": "Divide 13 by 40: \\(13 \\div 40 = 0.325\\).",
        "options": ["0.325", "0.35", "3.25", "0.0325"],
        "answer_index": 0,
        "correct_feedback": "13 ÷ 40 = 0.325.",
        "incorrect_feedback": "Divide the top by the bottom.",
        "hint": "Write it as 13 ÷ 40.",
        **overrides,
    }


def give_set(questions: list[dict], instruction: str = "Convert each fraction."):
    """A set as the model sets it in a turn, through DSPy's tool, which parses
    the JSON it writes: what the model reads back, and the cards the turn
    gathered for the app, as sent."""
    outputs = TurnOutputs()
    result = dspy.Tool(practice_tool(outputs))(
        instruction=instruction, questions=questions
    )
    return result, [
        card.tool_result.structured_content.model_dump(by_alias=True)
        for card in outputs.cards
    ]


def give(**overrides):
    """One question on its own card: what the model reads back, and each
    card's question as shown."""
    result, cards = give_set([written(**overrides)])
    return result, [card["questions"][0] for card in cards]


def test_a_question_reaches_the_app_as_a_card_and_the_model_is_told_not_to_repeat_it():
    result, cards = give()

    assert cards == [
        {
            "question": "Convert \\(\\frac{13}{40}\\) to a decimal.",
            "options": ["0.325", "0.35", "3.25", "0.0325"],
            "answerIndex": 0,
            "correctFeedback": "13 ÷ 40 = 0.325.",
            "incorrectFeedback": "Divide the top by the bottom.",
            "hint": "Write it as 13 ÷ 40.",
        }
    ]
    assert "Never write the questions, their options or answers" in result["done"]


def test_whitespace_is_tidied_and_blank_options_dropped():
    _, cards = give(options=["  0.325 ", "", "0.35\n", "3.25"], answer_index=0)

    assert cards[0]["options"] == ["0.325", "0.35", "3.25"]


@pytest.mark.parametrize(
    ("overrides", "problem"),
    [
        ({"question": "  "}, "empty"),
        ({"options": ["0.325"]}, "between 2 and 5"),
        ({"options": ["1", "2", "3", "4", "5", "6"]}, "between 2 and 5"),
        ({"options": ["0.3", "0.3", "0.4"]}, "the same answer"),
        ({"answer_index": 4}, "from 0 to 3"),
        ({"answer_index": -1}, "from 0 to 3"),
    ],
)
def test_a_question_that_cannot_be_shown_is_sent_back_to_the_model(overrides, problem):
    result, cards = give(**overrides)

    assert problem in result["error"]
    assert cards == []


def test_a_key_the_working_does_not_reach_is_refused():
    """The tutor can offer 7/8 with 0.75 marked right, having written 0.875
    in its own feedback."""
    result, cards = give(
        question="What is \\(\\frac{7}{8}\\) as a decimal?",
        working="7 ÷ 8 = 0.875",
        options=["0.75", "0.85", "0.78", "0.87"],
        answer_index=0,
    )

    assert "does not reach '0.75'" in result["error"]
    assert cards == []


def test_the_working_may_write_the_answer_in_latex():
    result, cards = give(working="\\(\\frac{13}{40} = 0.325\\)", answer_index=0)

    assert "error" not in result
    assert cards[0]["answerIndex"] == 0


@pytest.mark.parametrize(
    ("answer", "working"),
    [("0.3", "13 ÷ 40 = 0.325"), ("0.325", "13 ÷ 40 = 10.325"), ("3", "so x = 35")],
)
def test_an_answer_found_only_inside_a_longer_one_is_not_reached(answer, working):
    result, _ = give(options=[answer, "9.99", "8.88"], answer_index=0, working=working)

    assert "does not reach" in result["error"]


def test_an_answer_at_the_end_of_a_sentence_is_reached():
    result, _ = give(
        options=["x = 4", "x = 5"],
        answer_index=0,
        working="Subtract 3, then divide by 2: x = 4.",
    )

    assert "error" not in result


def test_the_same_number_written_two_ways_is_one_answer():
    """The model can offer 15, 15.0 and 15.00 as different answers."""
    result, _ = give(
        options=["15", "15.0", "15.00", "15.5"],
        answer_index=1,
        working="120 ÷ 8 = 15.0",
    )

    assert "Options '15' and '15.0' are the same answer" in result["error"]


@pytest.mark.parametrize(
    ("check", "options", "answer_index", "working"),
    [
        ("7/8", ["0.75", "0.85", "0.875"], 0, "7 ÷ 8 = 0.75"),
        ("120/8", ["₦15", "₦16", "₦12"], 1, "each gets ₦16"),
    ],
)
def test_a_key_the_arithmetic_disagrees_with_is_refused(
    check, options, answer_index, working
):
    """The working can be wrong too; the app's own arithmetic is not."""
    result, cards = give(
        check=check, options=options, answer_index=answer_index, working=working
    )

    assert result["error"].startswith("Question 1: check gives")
    assert cards == []


@pytest.mark.parametrize(
    ("check", "marked", "working"),
    [
        ("7/12", "0.5833", "7 ÷ 12 = 0.5833 to four places"),
        ("7/12", "\\(0.58\\overline{3}\\)", "7 ÷ 12 = \\(0.58\\overline{3}\\)"),
        ("120/8", "₦15", "Each friend gets ₦15"),
        ("29/8", "3.625", "3 5/8 = 29/8 = 3.625"),
    ],
)
def test_a_key_the_arithmetic_agrees_with_is_shown(check, marked, working):
    result, cards = give(
        check=check, options=[marked, "9.99", "8.88"], answer_index=0, working=working
    )

    assert "error" not in result, result
    assert cards[0]["answerIndex"] == 0


def test_a_check_that_is_not_arithmetic_is_sent_back():
    result, _ = give(check="__import__('os')")

    assert result["error"].startswith("Question 1: check could not be worked out")


def test_several_questions_reach_the_app_on_one_card():
    """Asked for three, the learner gets all three on one card, not one card
    wrapped in "Here is the first… second… third"."""
    result, cards = give_set(
        [
            written(),
            written(
                question="Convert 1/4.",
                working="1 ÷ 4 = 0.25",
                options=["0.25", "0.4"],
                check="1/4",
            ),
        ],
        instruction="Write each fraction as a decimal.",
    )

    [card] = cards
    assert card["instruction"] == "Write each fraction as a decimal."
    assert [q["question"] for q in card["questions"]] == [
        "Convert \\(\\frac{13}{40}\\) to a decimal.",
        "Convert 1/4.",
    ]
    assert "done" in result


def test_the_question_that_cannot_be_shown_is_named():
    result, cards = give_set([written(), written(answer_index=7)])

    assert result["error"].startswith("Question 2: answer_index")
    assert cards == []


@pytest.mark.parametrize("count", [0, 6])
def test_a_set_holds_one_to_five_questions(count):
    result, cards = give_set([written()] * count)

    assert "between 1 and 5 questions" in result["error"]
    assert cards == []


FRACTION = {
    "question": "What is \\(\\frac{9}{10} \\div \\frac{3}{5}\\)?",
    "working": "Multiply by the reciprocal: 9/10 * 5/3 = 45/30 = 3/2",
    "options": [
        "\\(\\frac{3}{2}\\)",
        "\\(\\frac{2}{3}\\)",
        "\\(\\frac{27}{50}\\)",
    ],
    "answer_index": 0,
    "check": "9/10 * 5/3 = 45/30 = 3/2",
}


def test_a_fraction_answer_is_checked_from_a_chained_check():
    """The model writes check as a chain and the answer as a fraction.
    Refused, it tries again until the turn runs out of steps, then writes the
    questions and their answers into its reply."""
    result, cards = give(**FRACTION)

    assert "error" not in result
    assert cards[0]["options"][0] == "\\(\\frac{3}{2}\\)"


def test_a_chain_whose_sides_differ_is_refused():
    result, cards = give(**{**FRACTION, "check": "9/10 * 5/3 = 3/2 = 2"})

    assert "are not equal" in result["error"]
    assert cards == []


@pytest.mark.parametrize("marked", ["3/2", "1 1/2", "1\\frac{1}{2}", "1.5"])
def test_the_working_reaches_the_key_however_the_number_is_written(marked):
    result, _ = give(
        **{**FRACTION, "options": [marked, "2/3", "27/50"], "check": "3/2"}
    )

    assert "error" not in result


def test_an_equal_fraction_is_the_same_answer_but_a_rounded_one_is_not():
    same, _ = give(**{**FRACTION, "options": ["3/2", "45/30", "2/3"]})
    distinct, _ = give(
        question="What is 1/3 as a decimal?",
        working="1 ÷ 3 = 0.3333",
        options=["0.3333", "0.3", "0.13"],
        answer_index=0,
        check="1/3",
    )

    assert "Options '3/2' and '45/30' are the same answer" in same["error"]
    assert "error" not in distinct


def test_every_question_that_cannot_be_shown_is_named_at_once():
    result, cards = give_set(
        [written(answer_index=7), written(), written(options=["1", "1"])]
    )

    assert result["error"].startswith("Question 1: answer_index")
    assert "Question 3: Options '1' and '1'" in result["error"]
    assert "Question 2" not in result["error"]
    assert "Never write the questions" in result["then"]
    assert cards == []
