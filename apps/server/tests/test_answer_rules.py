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
        "0.375 is correct.",
        "You got it!",
        "Correct, that is 3/8.",
        "Exactly, 3/8 is the sum.",
        "Right!",
        "Correct.",
        "Exactly! Perfect.",
        "That's the right answer.",
        "Spot on!",
    ],
)
def test_no_answer_is_called_right_until_the_app_has_marked_it(sentence):
    assert breach_in(sentence, facts()) is Breach.VERDICT
    assert breach_in(sentence, facts([False])) is Breach.VERDICT
    assert breach_in(sentence, facts([True])) is None


@pytest.mark.parametrize(
    "sentence",
    [
        "That's wrong.",
        "That is not quite right.",
        "Your answer is incorrect.",
        "Nope.",
        "Not quite!",
        "That isn't right.",
        "Wrong!",
        "Incorrect.",
        "Not quite, try again.",
        "Nope, the answer is 12.",
        "Wrong - add the numerators.",
        "Unfortunately that is wrong.",
    ],
)
def test_no_answer_is_called_wrong_until_the_app_has_marked_it(sentence):
    assert breach_in(sentence, facts()) is Breach.VERDICT
    assert breach_in(sentence, facts([True])) is Breach.VERDICT
    assert breach_in(sentence, facts([False])) is None


def test_two_taps_marked_differently_leave_no_bare_verdict():
    assert breach_in("That is correct.", facts([True, False])) is Breach.VERDICT
    assert breach_in("That is wrong.", facts([True, False])) is Breach.VERDICT


@pytest.mark.parametrize(
    "sentence",
    [
        "The correct way to add fractions is to find a common denominator.",
        "You're right to ask about this.",
        "Right, let us start with the denominator.",
        "It is right there in the question.",
        "Which option is correct?",
        "It's the right one to use here.",
        "Not quite sure what you mean.",
        "Tell me when you got it.",
        "Perfect, let us start with the denominator.",
        "Exactly how many apples are left?",
        "Unfortunately, Physics is not available yet.",
        "That is the correct way to add fractions.",
        "It's not correct to add denominators.",
        "It's wrong to add the denominators.",
        "I've added 3 and 4 to get 7.",
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
        "It's 0.375.",
        "3 divided by 8 equals 0.375.",
        "0.375",
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
        "Fractions has been added to your topics.",
        "I just switched your subject to Science.",
        "I added Algebra to your plan.",
        "Physics is now in your plan.",
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


MULTI = Question(
    question="Ada has 5 apples. She eats 2. How many are left?",
    options=["3", "7", "2"],
    answer_index=0,
    correct_feedback="",
    incorrect_feedback="",
    hint="",
)


def test_a_question_of_several_sentences_is_found_in_any_of_them():
    assert breach_in("How many are left?", facts(questions=[MULTI])) is Breach.CARD
    assert breach_in("Ada has 5 apples.", facts(questions=[MULTI])) is Breach.CARD


def test_a_short_option_is_not_found_inside_another_number():
    assert breach_in("Add 3/8 and 2.5 first.", facts(questions=[MULTI])) is None
    assert breach_in("Try it with 5 apples and 2.", facts(questions=[MULTI])) is None


WORD = Question(
    question="She ___ a teacher.",
    options=["is", "are", "am"],
    answer_index=0,
    correct_feedback="",
    incorrect_feedback="",
    hint="",
)


def test_a_short_grammar_word_that_is_the_key_does_not_condemn_every_sentence():
    assert breach_in("Here is one to try.", facts(questions=[WORD])) is None
