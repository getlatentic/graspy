"""The tutor's tools as native tool calls, checked on the wire: what the model is
sent, and what the tutor makes of what comes back."""

import json

import dspy
import httpx
import pytest
from test_event_loop import chat_reply, streamed

from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import AnswerDelta, ToolActivity
from app.agent.tutor import Tutor, TutorReply
from app.llm.client import build_lm
from app.llm.transport import HttpxTransport
from app.settings import Settings

CALCULATE = {
    "id": "call_1",
    "type": "function",
    "function": {"name": "calculate", "arguments": '{"expression": "12 * 7"}'},
}
ANSWER = "The product of 12 and 7 is 84.\n\nThat is twelve sevens added up, or seven twelves."


def tool_call_reply(*calls: dict) -> dict:
    return {
        "finish_reason": "tool_calls",
        "message": {"role": "assistant", "content": None, "tool_calls": list(calls)},
    }


def text_reply(content: str) -> dict:
    return {
        "finish_reason": "stop",
        "message": {"role": "assistant", "content": content},
    }


def model(*replies: dict | str, **overrides) -> tuple[dspy.LM, list[dict]]:
    """The real LM against a stand-in that gives these replies in order: a dict
    is a whole completion, a string is the streamed answer. Returns the request
    bodies it was sent."""
    pending, asked = list(replies), []

    async def answer(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        asked.append(body)
        reply = pending.pop(0)
        if isinstance(reply, str):
            return httpx.Response(
                200,
                content=streamed(reply, pieces=40),
                headers={"content-type": "text/event-stream"},
            )
        return httpx.Response(
            200,
            json={
                "id": "gen-test",
                "object": "chat.completion",
                "created": 0,
                "model": "openai.gpt-oss-120b",
                "choices": [{"index": 0, **reply}],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test", _env_file=None, **overrides
    )
    return build_lm(settings, transport=HttpxTransport(client)), asked


async def turn(lm: dspy.LM) -> list:
    with dspy.context(lm=lm):
        tutor = Tutor(InMemoryConversationStore())
        return [item async for item in tutor.stream("c1", "What is 12 times 7?")]


def final_answer() -> str:
    return chat_reply(reasoning="r", answer=ANSWER, follow_ups=["Why seven?"])


async def test_the_request_carries_the_tools_and_an_explicit_tool_choice():
    lm, asked = model(
        tool_call_reply(CALCULATE),
        text_reply("done"),
        final_answer(),
        llm_native_tools=True,
    )

    await turn(lm)

    first = asked[0]
    tools = {tool["function"]["name"]: tool for tool in first["tools"]}
    assert first["tool_choice"] == "auto"
    assert {"calculate", "open_topic", "give_practice", "load_skill"} <= set(tools)
    assert tools["load_skill"]["type"] == "function"
    assert tools["load_skill"]["function"]["parameters"]["properties"] == {
        "name": {"type": "string"}
    }
    assert tools["load_skill"]["function"]["parameters"]["required"] == ["name"]


async def test_the_tool_step_does_not_ask_for_a_thought_or_a_text_tool_call():
    lm, asked = model(
        tool_call_reply(CALCULATE),
        text_reply("done"),
        final_answer(),
        llm_native_tools=True,
    )

    await turn(lm)

    for body in asked[:2]:
        sent = json.dumps(body["messages"])
        assert "next_thought" not in sent
        assert "next_tool_name" not in sent
        assert "next_tool_args" not in sent


async def test_a_tool_result_goes_back_as_a_tool_message_and_the_answer_streams():
    lm, asked = model(
        tool_call_reply(CALCULATE),
        text_reply("done"),
        final_answer(),
        llm_native_tools=True,
    )

    items = await turn(lm)

    second = asked[1]["messages"]
    assert second[-2]["role"] == "assistant"
    assert second[-2]["tool_calls"][0]["function"]["name"] == "calculate"
    assert second[-1]["role"] == "tool"
    assert second[-1]["tool_call_id"] == "call_1"
    assert "84" in second[-1]["content"]
    assert "tools" not in asked[2] and asked[2]["stream"] is True
    assert [i.tool for i in items if isinstance(i, ToolActivity)] == ["calculate"]
    deltas = [i.text for i in items if isinstance(i, AnswerDelta)]
    assert len(deltas) > 1
    assert "".join(deltas).strip() == ANSWER
    assert isinstance(items[-1], TutorReply)
    assert items[-1].follow_ups == ["Why seven?"]


async def test_a_reply_with_no_tool_call_is_the_model_being_done():
    lm, asked = model(text_reply("done"), final_answer(), llm_native_tools=True)

    items = await turn(lm)

    assert len(asked) == 2
    assert not [i for i in items if isinstance(i, ToolActivity)]
    assert items[-1].answer == ANSWER


async def test_a_tool_the_tutor_does_not_have_is_reported_to_the_model():
    nothing = {**CALCULATE, "function": {"name": "teleport", "arguments": "{}"}}
    lm, asked = model(
        tool_call_reply(nothing),
        text_reply("done"),
        final_answer(),
        llm_native_tools=True,
    )

    await turn(lm)

    assert "no tool named teleport" in asked[1]["messages"][-1]["content"]


async def test_an_empty_reply_ends_the_tool_steps_and_the_answer_is_still_written():
    lm, asked = model(
        {"finish_reason": "length", "message": {"role": "assistant", "content": ""}},
        final_answer(),
        llm_native_tools=True,
    )

    items = await turn(lm)

    assert len(asked) == 2
    assert items[-1].answer == ANSWER


async def test_without_the_setting_the_tools_travel_as_text():
    lm, asked = model(
        text_reply(
            chat_reply(
                next_thought="I can answer", next_tool_name="finish", next_tool_args={}
            )
        ),
        final_answer(),
    )

    await turn(lm)

    assert "tools" not in asked[0] and "tool_choice" not in asked[0]
    assert "next_tool_name" in json.dumps(asked[0]["messages"])


@pytest.mark.parametrize(
    ("native", "declared"), [(True, True), (False, False)], ids=["on", "off"]
)
def test_the_model_states_whether_it_takes_native_tools(native, declared):
    """DSPy would look the custom model id up in litellm's registry and drop
    the tools, so the engine says it itself."""
    lm, _ = model(llm_native_tools=native)

    assert lm.supports_function_calling is declared


async def test_workers_ai_is_sent_the_tools_too():
    sent: list[dict] = []

    async def answer(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": "x",
                "object": "chat.completion",
                "created": 0,
                "model": "@cf/openai/gpt-oss-120b",
                "choices": [{"index": 0, **tool_call_reply(CALCULATE)}],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    lm = build_lm(
        Settings(
            llm_host="workers-ai",
            llm_native_tools=True,
            cloudflare_account_id="acct",
            cloudflare_api_token="cf-test",
            _env_file=None,
        ),
        transport=HttpxTransport(
            httpx.AsyncClient(transport=httpx.MockTransport(answer))
        ),
    )
    tool = dspy.Tool(lambda expression: expression, name="calculate", desc="d")

    with dspy.context(
        lm=lm, adapter=dspy.ChatAdapter(use_native_function_calling=True)
    ):
        await dspy.Predict(
            "question, tools: list[dspy.Tool] -> tool_calls: dspy.ToolCalls"
        ).acall(question="12 * 7", tools=[tool], config={"tool_choice": "auto"})

    assert [t["function"]["name"] for t in sent[0]["tools"]] == ["calculate"]
    assert sent[0]["tool_choice"] == "auto"
