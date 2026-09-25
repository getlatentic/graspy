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


def answering(sent: list[httpx.Request]) -> HttpxTransport:
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
        transport=answering(sent),
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
    lm = build_lm(settings(), transport=answering([]))

    with pytest.raises(LMError) as refused:
        lm("Hello")

    assert isinstance(refused.value.__cause__, RuntimeError)
    assert str(refused.value.__cause__) == (
        "Generation is async-only: call module.acall(...), not module(...). "
        "Cloudflare Workers cannot make a synchronous network request."
    )


async def test_a_call_reaches_workers_ai_with_the_account_the_token_and_the_limits():
    sent: list[httpx.Request] = []
    lm = build_lm(
        settings(
            llm_host="workers-ai",
            aws_bearer_token_bedrock=None,
            cloudflare_account_id="acct123",
            cloudflare_api_token="cf-test",
        ),
        transport=answering(sent),
    )

    reply = await lm.acall("Hello")

    [request] = sent
    body = json.loads(request.content)
    assert reply == ["Hi"]
    assert str(request.url) == (
        "https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1/chat/completions"
    )
    assert request.headers["authorization"] == "Bearer cf-test"
    assert body["model"] == "@cf/openai/gpt-oss-120b"
    assert body["reasoning_effort"] == "low"
    assert body["messages"] == [{"role": "user", "content": "Hello"}]


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({}, "bedrock-mantle-chat:openai.gpt-oss-120b"),
        (
            {"llm_model_id": "bedrock-mantle-chat:openai.gpt-oss-20b"},
            "bedrock-mantle-chat:openai.gpt-oss-20b",
        ),
        (
            {
                "llm_host": "workers-ai",
                "cloudflare_account_id": "a",
                "cloudflare_api_token": "t",
            },
            "openai-chat:@cf/openai/gpt-oss-120b",
        ),
    ],
    ids=["bedrock-default", "already-routed", "workers-ai-default"],
)
def test_each_host_routes_its_own_gpt_oss(overrides, expected):
    assert resolve_model(settings(**overrides)) == expected


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        (
            {"aws_bearer_token_bedrock": None},
            "LLM_HOST=bedrock needs AWS_BEARER_TOKEN_BEDROCK.",
        ),
        (
            {"llm_host": "workers-ai", "cloudflare_account_id": "a"},
            "LLM_HOST=workers-ai needs CLOUDFLARE_API_TOKEN.",
        ),
    ],
    ids=["bedrock", "workers-ai"],
)
def test_a_host_without_its_credentials_is_refused(overrides, message):
    with pytest.raises(RuntimeError) as refused:
        resolve_model(settings(**overrides))

    assert str(refused.value) == message


def test_configuring_dspy_installs_the_model_and_a_memory_only_cache():
    """A Worker's filesystem is memory: a disk cache would spend the isolate's
    128 MB."""
    configure_dspy(settings(llm_model_id="openai.gpt-oss-120b"))

    assert dspy.settings.lm.model == "bedrock-mantle-chat:openai.gpt-oss-120b"
    assert dspy.cache.enable_disk_cache is False
    assert dspy.cache.enable_memory_cache is True
