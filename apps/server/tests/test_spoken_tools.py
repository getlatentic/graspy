"""The tutor as spoken tools: questions made in code, answers marked in code."""

import pytest

from app.caller import Caller
from app.mcp.catalog import tools
from app.spoken.numbers import spoken_number
from app.spoken.questions import LEVELS, TOPICS, find, make

CALLER = Caller(None, None)


async def call(name: str, **arguments) -> dict:
    return await tools()[name].call(arguments, CALLER)


@pytest.mark.parametrize(
    ("said", "number"),
    [
        ("12", 12),
        ("twelve", 12),
        ("Twelve mangoes", 12),
        ("twenty-one", 21),
        ("one hundred and five", 105),
        ("1,250", 1250),
        ("two thousand and six", 2006),
        ("12.", 12),
        ("12.0", None),
        ("banana", None),
        ("", None),
        ("one point five", None),
        ("twenty one", 21),
        ("a hundred", 100),
        ("two hundred fifty", 250),
        ("it is twelve eggs", 12),
        ("twelve friends", 12),
        ("two thousand five hundred", 2500),
        ("9" * 400, None),
        ("not 12", None),
        ("12 or 13", None),
        ("3 and 4", None),
        ("three and four", None),
        ("twelve twelve", None),
        ("five five", None),
        ("hundred hundred", None),
        ("fifty-fifty", None),
        ("5 6", None),
        ("1,5", None),
        ("12 13", None),
        ("1e999", None),
        ("５", None),
        ("minus five", None),
        ("twelve and a half", None),
    ],
)
def test_a_number_is_heard_as_digits_or_words(said, number):
    assert spoken_number(said) == number


@pytest.mark.parametrize("topic", TOPICS)
@pytest.mark.parametrize("level", LEVELS)
def test_a_question_is_found_again_from_its_id(topic, level):
    for seed in range(40):
        question = make(topic, level, seed)
        assert find(question.id) == question
        assert question.answer > 0
        assert not any(question.working in hint for hint in question.hints)


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "addition",
        "addition.1",
        "addition.9.1",
        "x.1.1",
        "addition.1.-5",
        "addition.a.1",
    ],
)
def test_an_id_not_made_here_names_no_question(bad):
    assert find(bad) is None


def test_the_spoken_tools_are_offered_to_the_model_only():
    listed = {t.name: t.listed() for t in tools().values()}
    for name in ("next_question", "check_answer", "hint", "show_working"):
        assert listed[name]["_meta"]["ui"] == {"visibility": ["model"]}


async def test_a_right_answer_in_words_is_marked_right():
    asked = (await call("next_question", topic="multiplication", level=2))[
        "structuredContent"
    ]
    question = find(asked["question_id"])
    assert asked["say_to_the_child"] == question.text
    said = await call(
        "check_answer", question_id=question.id, answer=f"{question.answer}"
    )
    assert said["structuredContent"]["correct"] is True


async def test_a_wrong_answer_is_not_given_away():
    question = make("addition", 1, 3)
    told = (
        await call(
            "check_answer", question_id=question.id, answer=str(question.answer + 1)
        )
    )["structuredContent"]
    assert told["correct"] is False
    assert str(question.answer) not in "".join(
        str(v) for k, v in told.items() if k != "child_said"
    )


async def test_an_answer_that_is_not_a_number_is_asked_for_again():
    told = (
        await call(
            "check_answer",
            question_id=make("addition", 1, 3).id,
            answer="I do not know",
        )
    )["structuredContent"]
    assert told["understood"] is False and "correct" not in told


async def test_a_hint_never_says_the_answer_and_working_does():
    question = make("sharing", 2, 11)
    for step in (1, 2):
        nudged = (await call("hint", question_id=question.id, step=step))[
            "structuredContent"
        ]["hint"]
        assert nudged in question.hints
    shown = (await call("show_working", question_id=question.id))["structuredContent"]
    assert shown["answer"] == question.answer


async def test_an_unknown_topic_or_question_is_a_tool_error_the_assistant_can_correct():
    assert (await call("next_question", topic="astrology"))["isError"] is True
    assert (await call("check_answer", question_id="nope", answer="3"))[
        "isError"
    ] is True


@pytest.mark.parametrize("topic", TOPICS)
@pytest.mark.parametrize("level", LEVELS)
def test_no_question_counts_one_of_a_plural_thing(topic, level):
    for seed in range(200):
        assert " 1 " + "mangoes" not in make(topic, level, seed).text
        assert not any(
            f" 1 {thing}" in make(topic, level, seed).text
            for thing in ("mangoes", "oranges", "pencils", "bananas", "eggs", "books")
        )


def test_a_hint_never_lists_the_answer():
    for seed in range(500):
        question = make("multiplication", 1, seed)
        assert str(question.answer) not in question.hints[1].split(": ")[-1].replace(
            "and keep going.", ""
        ).replace(" ", "").split(",")
