"""LLM_BASE_URL: unset changes nothing; set, the call goes to that URL."""

import json

import httpx
import pytest
from dspy.lm15 import RouterConfig
from test_llm_client import KEY, answering

from app.llm.base_url import checked_base_url
from app.llm.client import build_lm, resolve_model
from app.llm.hosts import HOSTS, host_of
from app.settings import DEPLOYMENT_KEYS, Settings

GEMMA_URL = "https://bedrock-mantle.us-east-1.api.aws/openai/v1"
WORKERS = {
    "llm_host": "workers-ai",
    "aws_bearer_token_bedrock": None,
    "cloudflare_account_id": "acct",
    "cloudflare_api_token": "cf",
}


def settings(**overrides) -> Settings:
    return Settings(**{"aws_bearer_token_bedrock": KEY, "_env_file": None, **overrides})


def test_unset_leaves_each_hosts_router_config_as_it_was():
    bedrock = HOSTS["bedrock"].config(settings(), None)
    workers = HOSTS["workers-ai"].config(settings(**WORKERS), None)

    assert bedrock == RouterConfig(
        api_keys={"bedrock-mantle-chat": KEY},
        settings={"bedrock-mantle-chat": {"region": "us-east-1"}},
        transport=None,
    )
    assert workers == RouterConfig(
        api_keys={"openai-chat": "cf"},
        base_urls={
            "openai-chat": "https://api.cloudflare.com/client/v4/accounts/acct/ai/v1"
        },
        transport=None,
    )
    assert resolve_model(settings()) == "bedrock-mantle-chat:openai.gpt-oss-120b"


def test_a_blank_value_is_unset():
    assert checked_base_url("  ") is None
    assert resolve_model(settings(llm_base_url="")) == (
        "bedrock-mantle-chat:openai.gpt-oss-120b"
    )


def test_bedrock_with_a_url_routes_through_the_openai_chat_provider():
    config = HOSTS["bedrock"].config(settings(llm_base_url=GEMMA_URL + "/"), None)

    assert config == RouterConfig(
        api_keys={"openai-chat": KEY},
        base_urls={"openai-chat": GEMMA_URL},
        transport=None,
    )
    chosen = settings(llm_base_url=GEMMA_URL, llm_model_id="google.gemma-4-31b")
    assert resolve_model(chosen) == "openai-chat:google.gemma-4-31b"


def test_workers_ai_with_a_url_replaces_the_account_url():
    config = HOSTS["workers-ai"].config(
        settings(**WORKERS, llm_base_url="https://gateway.example.com/v1"), None
    )

    assert config.base_urls == {"openai-chat": "https://gateway.example.com/v1"}


async def test_a_bedrock_call_goes_to_the_overridden_url_with_the_bearer_key():
    sent: list[httpx.Request] = []
    lm = build_lm(
        settings(llm_base_url=GEMMA_URL + "/", llm_model_id="google.gemma-4-31b"),
        transport=answering(sent),
    )

    assert await lm.acall("Hello") == ["Hi"]

    [request] = sent
    assert str(request.url) == GEMMA_URL + "/chat/completions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert json.loads(request.content)["model"] == "google.gemma-4-31b"


async def test_a_workers_ai_call_goes_to_the_overridden_url():
    sent: list[httpx.Request] = []
    lm = build_lm(
        settings(**WORKERS, llm_base_url="https://gateway.example.com/v1"),
        transport=answering(sent),
    )

    await lm.acall("Hello")

    assert str(sent[0].url) == "https://gateway.example.com/v1/chat/completions"
    assert sent[0].headers["authorization"] == "Bearer cf"


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ("http://bedrock-mantle.us-east-1.api.aws/v1", "https"),
        ("ftp://example.com/v1", "https"),
        ("https://user:secret@example.com/v1", "credentials"),
        ("https://:secret@example.com/v1", "credentials"),
        ("https://example.com/v1?key=1", "query"),
        ("https://example.com/v1#top", "query"),
        ("https://example.com/v1?", "query"),
        ("example.com/v1", "absolute"),
        ("https:///v1", "absolute"),
        ("https://[::1/v1", "absolute"),
    ],
)
def test_an_unusable_url_is_refused_at_startup(raw, message):
    with pytest.raises(RuntimeError, match=message):
        host_of(settings(llm_base_url=raw))


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (GEMMA_URL + "///", GEMMA_URL),
        (f" {GEMMA_URL} ", GEMMA_URL),
        ("http://localhost:9000/v1", "http://localhost:9000/v1"),
        ("http://127.0.0.1:9000/v1/", "http://127.0.0.1:9000/v1"),
        ("http://[::1]:9000/v1", "http://[::1]:9000/v1"),
    ],
)
def test_a_good_url_is_normalised(raw, expected):
    assert checked_base_url(raw) == expected


def test_the_worker_passes_the_setting_through():
    assert "LLM_BASE_URL" in DEPLOYMENT_KEYS
