"""What the native tool step does with calls it cannot read, calls in excess,
and a model that never stops calling."""

import json

import pytest
from dspy.adapters.types.tool import ToolCalls
from test_native_tools import (
    ANSWER,
    CALCULATE,
    final_answer,
    model,
    text_reply,
    tool_call_reply,
    turn,
)
from test_runaway import GOOD, LOOPING, answered

from app.agent.native_react import NativeReAct
from app.agent.runaway import RETRY_TEMPERATURE
from app.agent.streaming import AnswerDelta, AnswerRestart
from app.agent.tutor import MAX_TOOL_STEPS

DONE = text_reply("done")


def call(name: str, arguments: str, call_id: str = "call_1") -> dict:
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": arguments},
    }


def calculation(n: int) -> dict:
    return call("calculate", json.dumps({"expression": f"{n} + 1"}), f"call_{n}")


NOT_JSON = call("calculate", "not json")
UNREADABLE = {
    "arguments that are a json string": call("calculate", '"12 * 7"'),
    "no function name": {
        "id": "call_1",
        "type": "function",
        "function": {"arguments": "{}"},
    },
}


@pytest.mark.parametrize("unreadable", UNREADABLE.values(), ids=UNREADABLE.keys())
async def test_a_call_with_odd_arguments_or_no_name_does_not_fail_the_turn(unreadable):
    lm, asked = model(
        tool_call_reply(unreadable), DONE, final_answer(), llm_native_tools=True
    )

    items = await turn(lm)

    assert items[-1].answer.strip() == ANSWER
    assert len(asked) == 3


async def test_arguments_that_are_not_json_come_back_to_the_model_as_a_tool_error():
    lm, asked = model(
        tool_call_reply(NOT_JSON), DONE, final_answer(), llm_native_tools=True
    )

    items = await turn(lm)

    assert items[-1].answer.strip() == ANSWER
    assert "Execution error in calculate" in asked[1]["messages"][-1]["content"]


def unreadable_for(times: int, monkeypatch):
    """The step as DSPy fails it when a call cannot be built: a pydantic error."""
    real = NativeReAct._tool_calls
    failures = []

    async def reading(self, history, pending):
        if len(failures) < times:
            failures.append(1)
            ToolCalls.from_dict_list([{"name": None, "args": {}}])
        return await real(self, history, pending)

    monkeypatch.setattr(NativeReAct, "_tool_calls", reading)


async def test_a_call_that_cannot_be_built_is_asked_again_and_the_turn_goes_on(
    monkeypatch,
):
    unreadable_for(1, monkeypatch)
    lm, asked = model(
        tool_call_reply(CALCULATE), DONE, final_answer(), llm_native_tools=True
    )

    items = await turn(lm)

    assert items[-1].answer.strip() == ANSWER
    assert len(asked) == 3
    assert "84" in asked[1]["messages"][-1]["content"]


async def test_a_call_that_cannot_be_built_twice_ends_the_tool_steps_not_the_turn(
    monkeypatch,
):
    unreadable_for(2, monkeypatch)
    lm, asked = model(final_answer(), llm_native_tools=True)

    items = await turn(lm)

    assert len(asked) == 1
    assert items[-1].answer.strip() == ANSWER


async def test_calls_beyond_the_first_three_in_a_step_are_not_run_and_the_model_is_told():
    lm, asked = model(
        tool_call_reply(*(calculation(n) for n in range(10, 15))),
        DONE,
        final_answer(),
        llm_native_tools=True,
    )

    await turn(lm)

    sent = asked[1]["messages"]
    assert [m["tool_call_id"] for m in sent if m["role"] == "tool"] == [
        "call_10",
        "call_11",
        "call_12",
    ]
    assert "2 call(s) beyond the first 3" in sent[-1]["content"]


async def test_a_call_repeated_exactly_is_run_once_and_the_model_is_told():
    lm, asked = model(
        tool_call_reply(
            call("calculate", '{"expression": "1 + 1"}', "a"),
            call("calculate", '{"expression":"1 + 1"}', "b"),
            call("calculate", '{"expression": "2 + 2"}', "c"),
        ),
        DONE,
        final_answer(),
        llm_native_tools=True,
    )

    await turn(lm)

    tools = [m for m in asked[1]["messages"] if m["role"] == "tool"]
    assert [m["tool_call_id"] for m in tools] == ["a", "c"]
    assert "1 repeated call(s)" in tools[-1]["content"]


async def test_two_calls_with_one_id_are_given_different_ids():
    lm, asked = model(
        tool_call_reply(
            call("calculate", '{"expression": "1 + 1"}', "same"),
            call("calculate", '{"expression": "2 + 2"}', "same"),
        ),
        DONE,
        final_answer(),
        llm_native_tools=True,
    )

    await turn(lm)

    ids = [m["tool_call_id"] for m in asked[1]["messages"] if m["role"] == "tool"]
    assert len(ids) == len(set(ids)) == 2


async def test_a_model_that_never_stops_calling_is_stopped_at_the_step_limit():
    lm, asked = model(
        *(tool_call_reply(calculation(n)) for n in range(MAX_TOOL_STEPS)),
        final_answer(),
        llm_native_tools=True,
    )

    items = await turn(lm)

    assert len(asked) == MAX_TOOL_STEPS + 1
    assert items[-1].answer.strip() == ANSWER


async def test_what_the_tool_step_writes_is_never_streamed_to_the_learner():
    step = {
        "finish_reason": "tool_calls",
        "message": {
            "role": "assistant",
            "content": "SECRET-STEP-TEXT",
            "tool_calls": [CALCULATE],
        },
    }
    lm, _ = model(
        step, text_reply("SECRET-DONE-TEXT"), final_answer(), llm_native_tools=True
    )

    items = await turn(lm)

    seen = "".join(i.text for i in items if isinstance(i, AnswerDelta))
    assert "SECRET" not in seen
    assert "SECRET" not in items[-1].answer


async def test_the_answer_written_again_after_a_runaway_keeps_the_native_step_and_samples():
    lm, asked = model(
        DONE,
        answered(LOOPING),
        DONE,
        answered(GOOD, ["Why ten?"]),
        llm_native_tools=True,
    )

    items = await turn(lm)

    assert any(isinstance(item, AnswerRestart) for item in items)
    assert items[-1].answer.strip() == GOOD
    assert [body["temperature"] for body in asked] == [0.0, 0.0] + [
        RETRY_TEMPERATURE
    ] * 2
    assert "tools" in asked[2] and "tools" not in asked[3]
