"""The calls a card's buttons make, as an MCP Apps UI makes them."""

import pytest

from app.agent.app_tools import MAX_CALLS, app_calls, describe_calls
from app.learner.answers import PracticeAnswer
from app.learner.record import MAX_TEXT

ANSWER = {
    "question": "What is 3/8 as a decimal?",
    "options": ["0.375", "0.38", "0.35"],
    "answerIndex": 0.0,
    "chosenIndex": 2.0,
}


def call(arguments=ANSWER, name="answer_practice", method="tools/call") -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": {"name": name, "arguments": arguments},
    }


def parts(*requests) -> list[dict]:
    return [{"text": "Explain"}, {"data": {"appCalls": list(requests)}}]


def test_a_tools_call_is_read_and_told_to_the_tutor():
    """Numbers cross A2A as doubles; an index is still a whole number."""
    [answered] = app_calls(parts(call()))

    assert answered.name == "answer_practice"
    assert answered.arguments == PracticeAnswer(
        question="What is 3/8 as a decimal?",
        options=["0.375", "0.38", "0.35"],
        answer_index=0,
        chosen_index=2,
    )
    assert answered.told == (
        "Question: What is 3/8 as a decimal?\n"
        "Options:\n1. 0.375\n2. 0.38\n3. 0.35\n"
        "The right answer: 0.375\n"
        "The learner chose: 0.35, which is wrong."
    )
    assert describe_calls([answered]).startswith(
        "The learner called answer_practice:\n"
    )


@pytest.mark.parametrize(
    "change",
    [
        {"chosenIndex": 3},
        {"answerIndex": -1},
        {"options": ["0.375"]},
        {"options": ["a", "b", "c", "d", "e", "f"]},
        {"question": "   "},
        {"chosenIndex": 0.5},
    ],
    ids=[
        "chosen-past-options",
        "negative-key",
        "one-option",
        "six-options",
        "blank",
        "fractional",
    ],
)
def test_arguments_that_do_not_add_up_drop_the_call(change):
    assert app_calls(parts(call({**ANSWER, **change}))) == []


@pytest.mark.parametrize(
    "request_",
    [
        call(name="give_practice"),
        call(name="rebuild_plan"),
        call(method="resources/read"),
        {"method": "tools/call"},
        "answer_practice",
    ],
    ids=["a-model-tool", "a-plan-change", "not-a-call", "no-params", "not-json-rpc"],
)
def test_only_app_tools_can_be_called_from_the_ui(request_):
    """A tap can answer a question; it cannot run the model's tools, which
    change the learner's plan."""
    assert app_calls(parts(request_)) == []


def test_calls_are_kept_in_order_and_capped():
    calls = app_calls(parts(*[call()] * (MAX_CALLS + 3)))

    assert len(calls) == MAX_CALLS


def test_long_text_is_cut_to_size():
    [answered] = app_calls(parts(call({**ANSWER, "question": "q" * 5000})))

    assert len(answered.arguments.question) == MAX_TEXT


def test_a_message_without_calls_has_none():
    assert app_calls([{"text": "hi"}, {"data": {"activity": "calculate"}}]) == []
