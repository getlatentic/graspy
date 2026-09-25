"""The model, checked on the wire."""

import json

import dspy
import httpx
import pytest
from dspy.utils.exceptions import LMError

from app.llm.client import build_lm, configure_dspy, resolve_model
from app.llm.transport import HttpxTransport
from app.settings import Settings

KEY = "bedrock-test"


def settings(**overrides) -> Settings:
    return Settings(**{"aws_bearer_token_bedrock": KEY, "_env_file": None, **overrides})


def bedrock(sent: list[httpx.Request]) -> HttpxTransport:
    def answer(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 0,
                "model": "openai.gpt-oss-120b",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "Hi"},
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    return HttpxTransport(httpx.AsyncClient(transport=httpx.MockTransport(answer)))


async def test_a_call_reaches_bedrock_mantle_with_the_key_the_model_and_the_limits():
    sent: list[httpx.Request] = []
    lm = build_lm(
        settings(llm_model_id="openai.gpt-oss-120b", aws_region="us-west-2"),
        transport=bedrock(sent),
    )

    reply = await lm.acall("Hello")

    [request] = sent
    body = json.loads(request.content)
    assert reply == ["Hi"]
    assert (
        str(request.url)
        == "https://bedrock-mantle.us-west-2.api.aws/v1/chat/completions"
    )
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert body["model"] == "openai.gpt-oss-120b"
    assert body["max_completion_tokens"] == 8192
    assert body["temperature"] == 0.0
    assert body["reasoning_effort"] == "low"
    assert body["messages"] == [{"role": "user", "content": "Hello"}]


def test_a_synchronous_call_is_refused_everywhere():
    """Workers cannot make one, so it is refused locally too."""
    lm = build_lm(settings(), transport=bedrock([]))

    with pytest.raises(LMError) as refused:
        lm("Hello")

    assert isinstance(refused.value.__cause__, RuntimeError)
    assert str(refused.value.__cause__) == (
        "Generation is async-only: call module.acall(...), not module(...). "
        "Cloudflare Workers cannot make a synchronous network request."
    )


@pytest.mark.parametrize(
    ("model_id", "expected"),
    [
        ("openai.gpt-oss-120b", "bedrock-mantle-chat:openai.gpt-oss-120b"),
        (
            "bedrock-mantle-chat:openai.gpt-oss-20b",
            "bedrock-mantle-chat:openai.gpt-oss-20b",
        ),
    ],
    ids=["bare", "already-routed"],
)
def test_the_model_is_routed_through_bedrock_mantle(model_id, expected):
    assert resolve_model(settings(llm_model_id=model_id)) == expected


def test_there_is_no_model_without_a_bedrock_key():
    with pytest.raises(RuntimeError) as refused:
        resolve_model(settings(aws_bearer_token_bedrock=None))

    assert (
        str(refused.value)
        == "AWS_BEARER_TOKEN_BEDROCK is required: Amazon Bedrock is the only provider."
    )


def test_configuring_dspy_installs_the_model_and_a_memory_only_cache():
    """A Worker's filesystem is memory: a disk cache would spend the isolate's
    128 MB."""
    configure_dspy(settings(llm_model_id="openai.gpt-oss-120b"))

    assert dspy.settings.lm.model == "bedrock-mantle-chat:openai.gpt-oss-120b"
    assert dspy.cache.enable_disk_cache is False
    assert dspy.cache.enable_memory_cache is True
