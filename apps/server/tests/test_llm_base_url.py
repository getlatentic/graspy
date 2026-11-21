"""LLM_BASE_URL: unset changes nothing; set, the call goes to that URL and the
key goes only to a host the deployment may send it to."""

import json
import logging
from types import SimpleNamespace

import httpx
import pytest
from dspy._vendor.lm15.transports._types import TransportRequest
from dspy.lm15 import RouterConfig
from test_llm_client import KEY, answering

from app.factory import create_app
from app.llm.base_url import checked_base_url, exact_host
from app.llm.client import build_lm, resolve_model
from app.llm.hosts import HOSTS, host_of
from app.llm.transport import HttpxTransport, RebasedTransport
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


@pytest.fixture(autouse=True)
def no_llm_settings_from_the_environment(monkeypatch):
    for name in (
        "LLM_PROFILE",
        "LLM_HOST",
        "LLM_MODEL_ID",
        "LLM_BASE_URL",
        "LLM_BASE_URL_ALLOW",
    ):
        monkeypatch.delenv(name, raising=False)


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
    chosen = settings(llm_base_url=OPENAI_PATH + "/")
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
    ("https://evil.example/v1", "this deployment's own"),
    (
        "https://bedrock-mantle.us-east-1.api.aws.evil.example/v1",
        "this deployment's own",
    ),
    ("https://xbedrock-mantle.us-east-1.api.aws/v1", "this deployment's own"),
    ("https://bedrock-mantle..api.aws/v1", "this deployment's own"),
    ("https://bedrock-mantle.us-east-1.amazonaws.com/v1", "this deployment's own"),
    ("https://bedrock-runtime.us-east-1.api.aws/v1", "this deployment's own"),
    ("https://bedrock-mantle.us_east_1.api.aws/v1", "this deployment's own"),
    ("https://bedrock-mantle.us.east.api.aws/v1", "this deployment's own"),
    ("https://bedrock-mantle.us-east-1.api.aws@evil.com/v1", "credentials"),
    ("https://bedrock-mantle.us-east-1.api.aws.evil.com/v1", "this deployment's own"),
    ("https://bedrock-mantle.us-ëast-1.api.aws/v1", "ASCII"),
    ("https://bedrock-mantle.us-east-1.api.аws/v1", "ASCII"),
    ("https://bedrock-mantle.us-east-1.api.aws.\u200b/v1", "ASCII"),
    (OWN + ":8443/v1", "https port"),
    ("https://bedrock-mantle.us-east-1.api.aws\u200d/v1", "ASCII"),
    ("https://bedrock-mantle.us-east-1.api.aws\u200c/v1", "ASCII"),
    ("https://localhost/v1", "this deployment's own"),
    ("http://localhost./v1", "https"),
    ("http://localhost.evil.example/v1", "https"),
    ("https://[::1]/v1", "this deployment's own"),
    ("http://[::ffff:127.0.0.1]/v1", "https"),
    ("https://127.0.0.1/v1", "this deployment's own"),
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
        settings(llm_base_url=raw), (exact_host("bedrock-mantle.us-east-1.api.aws"),)
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
        with pytest.raises(RuntimeError, match="this deployment's own"):
            checked_base_url(
                settings(llm_base_url=url, llm_base_url_allow=allow), (exact_host("x"),)
            )


def test_the_allow_setting_does_not_excuse_credentials():
    chosen = settings(
        llm_base_url="https://u:p@gateway.example.com/v1",
        llm_base_url_allow="gateway.example.com",
    )

    with pytest.raises(RuntimeError, match="credentials"):
        checked_base_url(chosen, ())


@pytest.mark.parametrize("region", ["us-west-2", "eu-west-1", "ap-southeast-2"])
async def test_any_region_of_the_mantle_host_is_accepted(region):
    url = f"https://bedrock-mantle.{region}.api.aws/v1"
    chosen = settings(llm_base_url=url + "/")
    request, _ = await _body_and_url(chosen)

    assert str(request.url) == url + "/chat/completions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert HOSTS["bedrock"].endpoint(chosen) == f"bedrock-mantle.{region}.api.aws"
    assert HOSTS["bedrock"].config(chosen, None).settings == {
        "bedrock-mantle-chat": {"region": region}
    }


@pytest.mark.parametrize(
    "raw",
    [
        "https://BEDROCK-MANTLE.US-WEST-2.API.AWS./v1",
        "https://bedrock-mantle.us-west-2.api.aws:443/v1",
    ],
)
def test_the_host_is_read_lower_cased_without_a_trailing_dot_or_port_443(raw):
    assert host_of(settings(llm_base_url=raw)) is HOSTS["bedrock"]


def test_the_key_is_not_sent_to_an_unlisted_host_even_with_a_region_look():
    with pytest.raises(RuntimeError, match="this deployment's own"):
        build_lm(
            settings(
                llm_base_url="https://bedrock-mantle.us-east-1.api.aws.evil.com/v1"
            )
        )


def test_a_stale_aws_region_is_ignored_with_one_warning(monkeypatch, caplog):
    monkeypatch.setenv("AWS_REGION", "eu-west-1")
    monkeypatch.setattr("app.settings._warned_of_region", False)

    with caplog.at_level(logging.WARNING, logger="app.settings"):
        first = settings()
        settings()

    warnings = [r for r in caplog.records if "AWS_REGION" in r.getMessage()]
    assert len(warnings) == 1
    assert "eu-west-1" not in warnings[0].getMessage()
    assert not hasattr(first, "aws_region")
    assert HOSTS["bedrock"].base_url(first) == OWN + "/v1"


GATEWAY_OTHER = "https://gateway.ai.cloudflare.com/v1/other-acct/gw/workers-ai/v1"
API_OWN = "https://api.cloudflare.com/client/v4/accounts/acct/ai/v1"


@pytest.mark.parametrize("url", [GATEWAY, API_OWN, GATEWAY + "/", API_OWN + "/"])
def test_workers_ai_accepts_its_own_accounts_path_on_both_hosts(url):
    chosen = settings(**WORKERS, llm_base_url=url)

    assert host_of(chosen).base_url(chosen) == url.rstrip("/")


@pytest.mark.parametrize(
    "url",
    [
        GATEWAY_OTHER,
        "https://api.cloudflare.com/client/v4/accounts/other-acct/ai/v1",
        "https://api.cloudflare.com/client/v4/accounts/acct2/ai/v1",
        "https://gateway.ai.cloudflare.com/v1/acct-evil/gw/workers-ai/v1",
        "https://gateway.ai.cloudflare.com/v1/acct/../other-acct/gw/v1",
        "https://gateway.ai.cloudflare.com/v1/acct/%2e%2e/other-acct/gw/v1",
        "https://gateway.ai.cloudflare.com/v1",
        "https://api.cloudflare.com/client/v4/user",
    ],
)
def test_another_accounts_path_on_a_shared_cloudflare_host_is_refused(url):
    with pytest.raises(RuntimeError, match="this deployment's own"):
        host_of(settings(**WORKERS, llm_base_url=url))


def test_the_allow_setting_still_opens_a_shared_cloudflare_host():
    chosen = settings(
        **WORKERS,
        llm_base_url=GATEWAY_OTHER,
        llm_base_url_allow="gateway.ai.cloudflare.com",
    )

    assert host_of(chosen).base_url(chosen) == GATEWAY_OTHER


def test_workers_ai_without_an_account_id_takes_no_url():
    chosen = settings(
        **{**WORKERS, "cloudflare_account_id": None}, llm_base_url=GATEWAY
    )

    with pytest.raises(RuntimeError, match="this deployment's own"):
        HOSTS["workers-ai"].base_url(chosen)


@pytest.mark.parametrize(
    "allow",
    [
        "a.example.com,b.example.com",
        "*.example.com",
        "https://gateway.example.com",
        "gateway.example.com:8443",
        "gateway.example.com/v1",
        "gateway.\u200dexample.com",
        "gateway.ex\u0430mple.com",
        "gateway example.com",
    ],
)
def test_the_allow_setting_is_one_plain_host_or_nothing(allow):
    chosen = settings(
        llm_base_url="https://gateway.example.com/v1", llm_base_url_allow=allow
    )

    with pytest.raises(RuntimeError, match="LLM_BASE_URL_ALLOW"):
        checked_base_url(chosen, ())


@pytest.mark.parametrize("blank", ["   ", "\t\n"])
def test_whitespace_settings_do_not_hide_the_profile(blank):
    named = settings(llm_profile="gemma-4-31b", llm_base_url=blank, llm_model_id=blank)

    assert resolve_model(named) == "bedrock-mantle-chat:google.gemma-4-31b"
    assert named.llm_base_url == OPENAI_PATH


def test_a_whitespace_model_id_without_a_profile_is_the_default_model():
    assert resolve_model(settings(llm_model_id="  ")) == (
        "bedrock-mantle-chat:openai.gpt-oss-120b"
    )


async def test_the_default_is_the_request_it_always_was():
    unset, unset_body = await _body_and_url(settings())
    named, named_body = await _body_and_url(settings(llm_base_url=OWN + "/v1"))

    assert str(unset.url) == OWN + "/v1/chat/completions"
    assert HOSTS["bedrock"].endpoint(settings()) == "bedrock-mantle.us-east-1.api.aws"
    assert not isinstance(
        HOSTS["bedrock"].config(settings(), None).transport, RebasedTransport
    )
    assert (named.method, str(named.url), named.headers, named.content) == (
        unset.method,
        str(unset.url),
        unset.headers,
        unset.content,
    )
    assert named_body == unset_body


def test_a_bad_url_stops_the_app_and_the_model_at_startup():
    bad = settings(llm_base_url="https://evil.example/v1", session_secret="s")

    with pytest.raises(RuntimeError, match="this deployment's own"):
        build_lm(bad)
    with pytest.raises(RuntimeError, match="this deployment's own"):
        create_app(bad)


async def test_a_real_transport_request_is_sent_to_the_new_base_and_not_redirected():
    reached: list[str] = []

    def answer(request: httpx.Request) -> httpx.Response:
        reached.append(str(request.url))
        if request.url.host == "bedrock-mantle.us-east-1.api.aws":
            return httpx.Response(302, headers={"location": "https://evil.example/x"})
        return httpx.Response(200, json={})

    inner = HttpxTransport(httpx.AsyncClient(transport=httpx.MockTransport(answer)))
    transport = RebasedTransport(inner, OWN + "/v1", OPENAI_PATH)
    request = TransportRequest(
        method="POST",
        url=OWN + "/v1/chat/completions",
        headers=[("authorization", "Bearer k")],
        body=b"{}",
    )

    async with transport.stream(request) as response:
        assert response.status == 302

    assert reached == [OPENAI_PATH + "/chat/completions"]
