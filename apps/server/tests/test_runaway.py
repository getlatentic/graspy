"""An answer that repeats itself as it streams is cut short and written again."""

import json

import dspy
import httpx
import pytest
from test_event_loop import chat_reply, streamed

from app.agent.memory import InMemoryConversationStore
from app.agent.runaway import REPEATS, RETRY_TEMPERATURE, Runaway, RunawayWatch
from app.agent.streaming import AnswerDelta, AnswerRestart
from app.agent.tutor import Tutor
from app.llm.client import build_lm
from app.llm.transport import HttpxTransport
from app.settings import Settings

GOOD = "Each place is worth ten times the place to its right: in 352, the 3 is 300."
# The loop as it happened: one non-breaking hyphen, inside a table.
LOOPING = "| Place | Value | Example (" + "‑" * 3000
STEP = chat_reply(
    next_thought="I can answer", next_tool_name="finish", next_tool_args={}
)


def answered(answer: str, follow_ups=()) -> str:
    return chat_reply(reasoning="r", answer=answer, follow_ups=list(follow_ups))


def model(*replies: str) -> tuple[dspy.LM, list[dict]]:
    """The real LM against a stand-in that gives these replies in order; a
    streamed one arrives in pieces, as Bedrock sends it."""
    pending, asked = list(replies), []

    async def answer(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        asked.append(body)
        if body.get("stream"):
            return httpx.Response(
                200,
                content=streamed(pending.pop(0), pieces=20),
                headers={"content-type": "text/event-stream"},
            )
        return httpx.Response(
            200,
            json={
                "id": "gen-test",
                "object": "chat.completion",
                "created": 0,
                "model": "openai.gpt-oss-120b",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": pending.pop(0)},
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    settings = Settings(aws_bearer_token_bedrock="bedrock-test", _env_file=None)
    return build_lm(settings, transport=HttpxTransport(client)), asked


async def turn(lm: dspy.LM, memory=None) -> list:
    with dspy.context(lm=lm):
        tutor = Tutor(memory or InMemoryConversationStore())
        return [item async for item in tutor.stream("c1", "Explain place value")]


async def test_a_looping_answer_is_withdrawn_and_written_again_with_sampling():
    lm, asked = model(STEP, answered(LOOPING), STEP, answered(GOOD, ["Why ten?"]))

    items = await turn(lm)

    restart = next(i for i, item in enumerate(items) if isinstance(item, AnswerRestart))
    before = "".join(i.text for i in items[:restart] if isinstance(i, AnswerDelta))
    after = "".join(i.text for i in items[restart:] if isinstance(i, AnswerDelta))
    # Cut long before the 3,000 repeats run out.
    assert before.count("‑") < REPEATS + 200
    assert after.strip() == GOOD
    assert (items[-1].answer, items[-1].follow_ups) == (GOOD, ["Why ten?"])
    assert [body["temperature"] for body in asked] == [0.0, 0.0] + [
        RETRY_TEMPERATURE
    ] * 2


async def test_an_answer_that_runs_out_is_written_again():
    """A loop in what is not streamed ends when the model runs out, with the
    answer's other fields missing."""
    ran_out = chat_reply(reasoning="r" * 50, answer="Each place")
    lm, _ = model(STEP, ran_out, STEP, answered(GOOD))

    items = await turn(lm)

    assert any(isinstance(item, AnswerRestart) for item in items)
    assert items[-1].answer == GOOD


async def test_a_second_runaway_fails_the_turn_and_is_not_remembered():
    memory = InMemoryConversationStore()
    lm, _ = model(STEP, answered(LOOPING), STEP, answered(LOOPING))

    with pytest.raises(Runaway):
        await turn(lm, memory)

    assert (await memory.load("c1")).exchanges == ()


@pytest.mark.parametrize(
    "text",
    [
        "| Place | Value |\n|---|---|---|---|---|---|---|---|\n| 3 | 300 |",
        # Measured: the model aligns a wide table with long separators.
        "| Place (ones) | Value |\n|" + "-" * 90 + "|" + "-" * 90 + "|",
        "Fill in the blank: 3 × ____________ = 12",
        "\\(\\frac{1}{3} = 0.3333333333\\)",
        "=" * 40,
        "ha " * 30,
        " " * 200 + "indented code",
        "Ọ̀rọ̀ " * 12,
    ],
    ids=[
        "table",
        "aligned-table",
        "blank",
        "recurring",
        "rule",
        "laughter",
        "spaces",
        "yoruba",
    ],
)
def test_what_a_learner_reads_is_not_mistaken_for_a_loop(text):
    watch = RunawayWatch()
    for start in range(0, len(text), 7):
        watch.add(text[start : start + 7])


@pytest.mark.parametrize("unit", ["‑", "-", "| ", "0", "ab", "\\;"], ids=repr)
def test_a_unit_repeated_on_and_on_is_a_loop(unit):
    watch = RunawayWatch()
    watch.add("Example: ")

    with pytest.raises(Runaway):
        for _ in range(REPEATS):
            watch.add(unit)
