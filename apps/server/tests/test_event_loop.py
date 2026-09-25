"""Generation through the real stack never holds the event loop: a Worker has
no threads to fall back on."""

import asyncio
import json

import dspy
import httpx
import pytest

from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import AnswerDelta
from app.agent.tutor import Tutor
from app.llm.client import build_lm
from app.llm.transport import HttpxTransport
from app.settings import Settings

MODEL_SECONDS = 0.3
TICK_SECONDS = 0.01


def chat_reply(**fields) -> str:
    """A completion in DSPy's chat format, as the model writes it."""
    sections = [
        f"[[ ## {name} ## ]]\n{value if isinstance(value, str) else json.dumps(value)}"
        for name, value in fields.items()
    ]
    return "\n\n".join([*sections, "[[ ## completed ## ]]"])


def streamed(content: str, pieces: int = 4) -> bytes:
    """A completion as Bedrock streams it: server-sent chunks of the
    content, a closing chunk with the finish reason, then [DONE]."""
    size = max(1, len(content) // pieces)
    chunks = [content[i : i + size] for i in range(0, len(content), size)]
    events = [
        {
            "id": "gen-test",
            "object": "chat.completion.chunk",
            "choices": [{"index": 0, "delta": {"content": chunk}}],
        }
        for chunk in chunks
    ]
    events.append(
        {
            "id": "gen-test",
            "object": "chat.completion.chunk",
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }
    )
    return (
        "".join(f"data: {json.dumps(event)}\n\n" for event in events).encode()
        + b"data: [DONE]\n\n"
    )


def slow_model(*replies: str) -> dspy.LM:
    """The real LM, against a Bedrock stand-in that takes MODEL_SECONDS per answer."""
    pending = list(replies)

    async def answer(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(MODEL_SECONDS)
        if json.loads(request.content).get("stream"):
            return httpx.Response(
                200,
                content=streamed(pending.pop(0)),
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
    return build_lm(settings, transport=HttpxTransport(client))


async def _ticks_during(work) -> int:
    """How many times the loop got control while `work` ran."""
    ticks = 0

    async def tick():
        nonlocal ticks
        while True:
            await asyncio.sleep(TICK_SECONDS)
            ticks += 1

    ticker = asyncio.create_task(tick())
    try:
        await work
    finally:
        ticker.cancel()
        with pytest.raises(asyncio.CancelledError):
            await ticker
    return ticks


async def finished(turn):
    """The finished reply at the end of a turn's stream."""
    return [item async for item in turn][-1]


def tutor_turn(answer: str, follow_ups: list[str]) -> tuple[str, str]:
    """A tutor turn needing no tool: the step that finishes, then the answer."""
    return (
        chat_reply(
            next_thought="I can answer", next_tool_name="finish", next_tool_args={}
        ),
        chat_reply(reasoning="r", answer=answer, follow_ups=follow_ups),
    )


async def test_a_slow_model_does_not_stall_other_requests():
    lm = slow_model(*tutor_turn("ok", []))
    with dspy.context(lm=lm):
        ticks = await _ticks_during(
            finished(Tutor(InMemoryConversationStore()).stream("c1", "hi"))
        )

    # A blocked loop yields once at most; an unblocked one ticks throughout.
    assert ticks > 5


async def test_the_real_stack_returns_the_models_answer():
    lm = slow_model(*tutor_turn("Seven", ["Why?"]))
    with dspy.context(lm=lm):
        reply = await finished(
            Tutor(InMemoryConversationStore()).stream("c1", "3 + 4?")
        )

    assert (reply.answer, reply.follow_ups) == ("Seven", ["Why?"])


async def test_the_real_stack_streams_the_answer_in_pieces():
    """Through DSPy, lm15 and the httpx transport, as in production: the
    learner reads the answer while it is written, and the pieces add up to
    the answer that is kept."""
    answer = "Seven, because three and four more make seven altogether, which you can count on your fingers."
    lm = slow_model(*tutor_turn(answer, []))
    with dspy.context(lm=lm):
        items = [
            item
            async for item in Tutor(InMemoryConversationStore()).stream("c1", "3 + 4?")
        ]

    deltas = [item.text for item in items if isinstance(item, AnswerDelta)]
    assert len(deltas) > 1
    assert "".join(deltas).strip() == answer
    assert items[-1].answer == answer
