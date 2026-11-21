"""LLM_BASE_URL: unset changes nothing; set, the call goes to that URL and the
key goes only to a host the deployment may send it to."""

import json
import logging
from types import SimpleNamespace

import httpx
import pytest
from dspy.lm15 import RouterConfig
from test_llm_client import KEY, answering

from app.llm.base_url import checked_base_url
from app.llm.client import build_lm, resolve_model
from app.llm.hosts import HOSTS, host_of
from app.llm.transport import RebasedTransport
from app.settings import Settings

OWN = "https://bedrock-mantle.us-east-1.api.aws"
OPENAI_PATH = OWN + "/openai/v1"
WORKERS = {
    "llm_host": "workers-ai",
    "aws_bearer_token_bedrock": None,
    "cloudflare_account_id": "acct",
    "cloudflare_api_token": "cf",
}
GATEWAY = "https://gateway.ai.cloudflare.com/v1/acct/gw/workers-ai/v1"


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
    assert checked_base_url(settings(llm_base_url="  "), ()) is None
    assert resolve_model(settings(llm_base_url="")) == (
        "bedrock-mantle-chat:openai.gpt-oss-120b"
    )


def test_bedrock_with_a_url_keeps_its_provider_credentials_and_region():
    chosen = settings(llm_base_url=OPENAI_PATH + "/", aws_region="us-east-1")
    config = HOSTS["bedrock"].config(chosen, None)

    assert config.api_keys == {"bedrock-mantle-chat": KEY}
    assert config.settings == {"bedrock-mantle-chat": {"region": "us-east-1"}}
    assert config.base_urls is None
    assert isinstance(config.transport, RebasedTransport)
    assert resolve_model(chosen) == "bedrock-mantle-chat:openai.gpt-oss-120b"


def test_workers_ai_with_a_url_replaces_the_account_url():
    config = HOSTS["workers-ai"].config(settings(**WORKERS, llm_base_url=GATEWAY), None)

    assert config.base_urls == {"openai-chat": GATEWAY}


async def _body_and_url(chosen: Settings) -> tuple[httpx.Request, dict]:
    sent: list[httpx.Request] = []
    lm = build_lm(chosen, transport=answering(sent))
    assert await lm.acall("Hello") == ["Hi"]
    [request] = sent
    return request, json.loads(request.content)


async def test_a_bedrock_call_goes_to_the_url_with_the_default_routes_body():
    default, default_body = await _body_and_url(
        settings(llm_model_id="google.gemma-4-31b")
    )
    moved, moved_body = await _body_and_url(
        settings(llm_model_id="google.gemma-4-31b", llm_base_url=OPENAI_PATH + "/")
    )

    assert str(default.url) == OWN + "/v1/chat/completions"
    assert str(moved.url) == OPENAI_PATH + "/chat/completions"
    assert moved_body == default_body
    assert moved.headers["authorization"] == f"Bearer {KEY}"
    assert {k: v for k, v in moved.headers.items() if k != "host"} == {
        k: v for k, v in default.headers.items() if k != "host"
    }


async def test_a_gpt_oss_call_on_a_url_keeps_the_dialects_model_rules():
    _, default_body = await _body_and_url(settings())
    _, moved_body = await _body_and_url(settings(llm_base_url=OPENAI_PATH))

    assert moved_body == default_body
    assert "json_schema" not in json.dumps(moved_body)


def test_a_request_not_under_the_expected_base_is_refused_not_sent_on():
    transport = RebasedTransport(answering([]), "https://elsewhere.test/v1", OWN)

    with pytest.raises(RuntimeError, match="Expected a request under"):
        transport.stream(SimpleNamespace(url=OWN + "/v1/chat/completions"))


async def test_a_workers_ai_call_goes_to_the_url():
    sent: list[httpx.Request] = []
    lm = build_lm(settings(**WORKERS, llm_base_url=GATEWAY), transport=answering(sent))

    await lm.acall("Hello")

    assert str(sent[0].url) == GATEWAY + "/chat/completions"
    assert sent[0].headers["authorization"] == "Bearer cf"


BAD = [
    ("http://bedrock-mantle.us-east-1.api.aws/v1", "https"),
    ("ftp://example.com/v1", "https"),
    ("https://user:secret@example.com/v1", "credentials"),
    ("https://:secret@example.com/v1", "credentials"),
    (OWN + "@evil.example/v1", "credentials"),
    ("http://localhost@evil.example/v1", "credentials"),
    ("https://example.com/v1?key=1", "query"),
    ("https://example.com/v1#top", "query"),
    ("example.com/v1", "absolute"),
    ("https:///v1", "absolute"),
    ("https://[::1/v1", "absolute"),
    (OWN + ":abc/v1", "absolute"),
    (OWN + ":99999/v1", "absolute"),
    ("https://evil.example/v1", "not one of"),
    ("https://bedrock-mantle.us-east-1.api.aws.evil.example/v1", "not one of"),
    ("https://xbedrock-mantle.us-east-1.api.aws/v1", "not one of"),
    ("https://bedrock-mantle.us-west-2.api.aws/v1", "not one of"),
    ("https://bedrock-mantle.us-east-1.api.аws/v1", "not one of"),
    ("https://bedrock-mantle.us-east-1.api.aws.\u200b/v1", "not a valid name"),
    ("https://localhost/v1", "not one of"),
    ("http://localhost./v1", "https"),
    ("http://localhost.evil.example/v1", "https"),
    ("https://[::1]/v1", "not one of"),
    ("http://[::ffff:127.0.0.1]/v1", "https"),
    ("https://127.0.0.1/v1", "not one of"),
]


@pytest.mark.parametrize(("raw", "message"), BAD)
def test_an_unusable_url_is_refused_at_startup(raw, message):
    with pytest.raises(RuntimeError, match=message) as refused:
        host_of(settings(llm_base_url=raw))

    assert raw not in str(refused.value)
    assert "secret" not in str(refused.value)


@pytest.mark.parametrize(
    "raw",
    [
        "https://example.com/v1",
        "https://api.cloudflare.com.evil.example/v1",
        "https://gateway.ai.cloudflare.com@evil.example/v1",
    ],
)
def test_workers_ai_accepts_only_cloudflare_hosts(raw):
    with pytest.raises(RuntimeError):
        host_of(settings(**WORKERS, llm_base_url=raw))


@pytest.mark.parametrize(
    "raw",
    [
        OPENAI_PATH,
        OPENAI_PATH + "///",
        f" {OPENAI_PATH} ",
        "https://BEDROCK-MANTLE.us-east-1.api.aws/openai/v1",
        "https://bedrock-mantle.us-east-1.api.aws./openai/v1",
        "https://bedrock-mantle.us-east-1.api.aws:443/openai/v1",
    ],
)
def test_the_hosts_own_name_is_accepted_in_any_spelling(raw):
    url = checked_base_url(
        settings(llm_base_url=raw), ("bedrock-mantle.us-east-1.api.aws",)
    )

    assert url.endswith("/openai/v1")


@pytest.mark.parametrize(
    "raw",
    [
        "http://localhost:9000/v1",
        "http://127.0.0.1:9000/v1/",
        "http://[::1]:9000/v1",
    ],
)
def test_http_to_localhost_is_for_development_only(raw):
    assert checked_base_url(settings(llm_base_url=raw), ()) == raw.rstrip("/")

    with pytest.raises(RuntimeError, match="not when deployed"):
        checked_base_url(settings(llm_base_url=raw, app_env="staging"), ())


def test_another_host_needs_its_exact_name_in_the_allow_setting(caplog):
    url = "https://gateway.example.com/v1"

    with caplog.at_level(logging.WARNING):
        chosen = settings(llm_base_url=url, llm_base_url_allow="Gateway.Example.com.")
        assert checked_base_url(chosen, ()) == url
    assert "gateway.example.com" in caplog.text
    for allow in ("example.com", "gateway.example.co", "evil.gateway.example.com", ""):
        with pytest.raises(RuntimeError, match="not one of"):
            checked_base_url(
                settings(llm_base_url=url, llm_base_url_allow=allow), ("x",)
            )


def test_the_allow_setting_does_not_excuse_credentials():
    chosen = settings(
        llm_base_url="https://u:p@gateway.example.com/v1",
        llm_base_url_allow="gateway.example.com",
    )

    with pytest.raises(RuntimeError, match="credentials"):
        checked_base_url(chosen, ())


def test_a_region_that_is_not_a_dns_label_is_refused():
    with pytest.raises(ValueError, match="AWS_REGION"):
        settings(aws_region="us-east-1.evil.example")
