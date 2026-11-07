"""What the tutor's answer must never say, judged one sentence at a time."""

import pytest

from app.agent.answer_rules import Breach, Facts, breach_in
from app.agent.cards import Question

QUESTION = Question(
    question="What is 3/8 as a decimal?",
    options=["0.375", "0.38", "0.35"],
    answer_index=0,
    correct_feedback="",
    incorrect_feedback="",
    hint="",
)


def facts(verdicts=(), questions=(), acted=False) -> Facts:
    return Facts(verdicts=tuple(verdicts), questions=tuple(questions), acted=acted)


@pytest.mark.parametrize(
    "sentence",
    [
        "That's right!",
        "That is correct.",
        "You're right.",
        "Your answer is absolutely correct.",
        "It’s correct, well done.",
        "You got it right!",
        "Correct! Nice work.",
        "Well done 🎉.",
        "Spot on!",
    ],
)
def test_no_answer_is_called_right_until_the_app_has_marked_it(sentence):
    assert breach_in(sentence, facts()) is Breach.VERDICT
    assert breach_in(sentence, facts([False])) is Breach.VERDICT
    assert breach_in(sentence, facts([True])) is None


@pytest.mark.parametrize(
    "sentence",
    ["That's wrong.", "That is not quite right.", "Your answer is incorrect."],
)
def test_no_answer_is_called_wrong_until_the_app_has_marked_it(sentence):
    assert breach_in(sentence, facts()) is Breach.VERDICT
    assert breach_in(sentence, facts([True])) is Breach.VERDICT
    assert breach_in(sentence, facts([False])) is None


def test_two_taps_marked_differently_leave_the_tutor_to_say_which():
    assert breach_in("That one is correct.", facts([True, False])) is None


@pytest.mark.parametrize(
    "sentence",
    [
        "The correct way to add fractions is to find a common denominator.",
        "You're right to ask about this.",
        "Right, let us start with the denominator.",
        "A common mistake is thinking that 0.38 is wrong because it looks odd.",
    ],
)
def test_words_that_are_not_a_verdict_on_an_answer_pass(sentence):
    assert breach_in(sentence, facts()) is None


@pytest.mark.parametrize(
    "sentence",
    [
        "What is 3/8 as a decimal?",
        "Try this: what is 3/8 as a decimal, 0.375, 0.38 or 0.35?",
        "The first one is 0.375 or 0.38.",
        "The answer is 0.375.",
        "The correct choice is 0.375.",
    ],
)
def test_a_card_is_not_written_into_the_answer(sentence):
    assert breach_in(sentence, facts(questions=[QUESTION])) is Breach.CARD
    assert breach_in(sentence, facts()) is None


@pytest.mark.parametrize(
    "sentence",
    [
        "Here is one to try.",
        "Take your time with the decimal.",
        "Think about dividing 3 by 8.",
        "I made 1 question for you.",
    ],
)
def test_an_introduction_to_a_card_passes(sentence):
    assert breach_in(sentence, facts(questions=[QUESTION])) is None


@pytest.mark.parametrize(
    "sentence",
    [
        "I've added Algebra to your plan.",
        "I have changed your subjects.",
        "Fractions has been added.",
        "I just switched you to Science.",
    ],
)
def test_nothing_is_said_to_be_done_that_no_tool_did(sentence):
    assert breach_in(sentence, facts()) is Breach.CLAIM
    assert breach_in(sentence, facts(acted=True)) is None


@pytest.mark.parametrize(
    "sentence", ["I've opened the fractions lesson.", "The lesson is now open."]
)
def test_the_app_opens_a_lesson_never_the_tutor(sentence):
    assert breach_in(sentence, facts(acted=True)) is Breach.CLAIM


def test_it_is_ready_below_passes():
    assert breach_in("The fractions lesson is ready below.", facts(acted=True)) is None
