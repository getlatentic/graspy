"""LLM_PROFILE: a host, model id and base URL chosen by name."""

import argparse
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.cloudflare import deployment_environment
from app.llm.client import resolve_model
from app.llm.hosts import HOSTS, host_of
from app.llm.profiles import PROFILES
from app.llm.transport import RebasedTransport
from app.settings import DEPLOYMENT_KEYS, Settings

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

SECRET = "AKIA-bearer-secret-value"
BASE = {
    "aws_bearer_token_bedrock": SECRET,
    "cloudflare_account_id": "acct",
    "cloudflare_api_token": "cf-secret-value",
    "_env_file": None,
}
GEMMA_URL = "https://bedrock-mantle.us-east-1.api.aws/openai/v1"


@pytest.fixture(autouse=True)
def no_llm_settings_from_the_environment(monkeypatch):
    for name in (
        "LLM_PROFILE",
        "LLM_HOST",
        "LLM_MODEL_ID",
        "LLM_BASE_URL",
        "LLM_BASE_URL_ALLOW",
        "AWS_REGION",
    ):
        monkeypatch.delenv(name, raising=False)


def settings(**overrides) -> Settings:
    return Settings(**{**BASE, **overrides})


def test_no_profile_is_todays_defaults():
    plain = settings()

    assert (plain.llm_host, plain.llm_model_id, plain.llm_base_url) == (
        "bedrock",
        None,
        None,
    )
    assert resolve_model(plain) == "bedrock-mantle-chat:openai.gpt-oss-120b"
    config = HOSTS["bedrock"].config(plain, None)
    assert config.base_urls is None
    assert config.transport is None


def test_the_gpt_oss_profile_is_the_default_model():
    named = settings(llm_profile="gpt-oss-120b")

    assert resolve_model(named) == resolve_model(settings())
    assert HOSTS["bedrock"].config(named, None) == HOSTS["bedrock"].config(
        settings(), None
    )


@pytest.mark.parametrize(
    ("name", "host", "model", "url"),
    [
        ("gpt-oss-120b", "bedrock", "bedrock-mantle-chat:openai.gpt-oss-120b", None),
        (
            "gemma-4-31b",
            "bedrock",
            "bedrock-mantle-chat:google.gemma-4-31b",
            GEMMA_URL,
        ),
        (
            "gpt-oss-120b-workers-ai",
            "workers-ai",
            "openai-chat:@cf/openai/gpt-oss-120b",
            None,
        ),
    ],
)
def test_each_profile_resolves_to_its_host_model_and_url(name, host, model, url):
    named = settings(llm_profile=name)

    assert named.llm_host == host
    assert resolve_model(named) == model
    assert named.llm_base_url == url
    host_of(named)


def test_the_gemma_profile_sends_to_the_openai_path_of_the_region():
    config = HOSTS["bedrock"].config(settings(llm_profile="gemma-4-31b"), None)

    assert config.api_keys == {"bedrock-mantle-chat": SECRET}
    assert isinstance(config.transport, RebasedTransport)
    assert config.transport._new == GEMMA_URL
    assert config.transport._old == "https://bedrock-mantle.us-east-1.api.aws/v1"


def test_the_gemma_profile_follows_the_region():
    west = settings(llm_profile="gemma-4-31b", aws_region="eu-west-1")
    config = HOSTS["bedrock"].config(west, None)

    assert west.llm_base_url == ("https://bedrock-mantle.eu-west-1.api.aws/openai/v1")
    assert config.settings == {"bedrock-mantle-chat": {"region": "eu-west-1"}}
    assert config.transport._old == "https://bedrock-mantle.eu-west-1.api.aws/v1"
    assert HOSTS["bedrock"].endpoint(west) == "bedrock-mantle.eu-west-1.api.aws"


def test_the_workers_profile_builds_the_workers_ai_config():
    named = settings(llm_profile="gpt-oss-120b-workers-ai")
    config = HOSTS["workers-ai"].config(named, None)

    assert config.api_keys == {"openai-chat": "cf-secret-value"}
    assert config.base_urls == {
        "openai-chat": "https://api.cloudflare.com/client/v4/accounts/acct/ai/v1"
    }
    assert HOSTS["workers-ai"].endpoint(named) == "api.cloudflare.com"


def test_explicit_model_and_url_win_over_the_profile():
    named = settings(
        llm_profile="gemma-4-31b",
        llm_model_id="google.gemma-4-12b",
        llm_base_url="https://bedrock-mantle.us-east-1.api.aws/v1/",
    )

    assert resolve_model(named) == "bedrock-mantle-chat:google.gemma-4-12b"
    config = HOSTS["bedrock"].config(named, None)
    assert config.transport._new == "https://bedrock-mantle.us-east-1.api.aws/v1"


def test_a_host_that_disagrees_with_the_profile_is_refused_naming_both():
    with pytest.raises(ValidationError) as refused:
        settings(llm_profile="gemma-4-31b", llm_host="workers-ai")

    text = str(refused.value)
    assert "LLM_PROFILE=gemma-4-31b" in text
    assert "LLM_HOST=workers-ai" in text
    assert "cf-secret-value" not in text and SECRET not in text


def test_the_workers_profile_beside_the_deployments_bedrock_host_is_refused():
    with pytest.raises(ValidationError, match="LLM_HOST=bedrock"):
        settings(llm_profile="gpt-oss-120b-workers-ai", llm_host="bedrock")


def test_a_host_that_agrees_with_the_profile_is_fine():
    named = settings(llm_profile="gemma-4-31b", llm_host="bedrock")

    assert resolve_model(named) == "bedrock-mantle-chat:google.gemma-4-31b"


def test_blank_model_and_url_do_not_hide_the_profile():
    named = settings(llm_profile="gemma-4-31b", llm_model_id="", llm_base_url="")

    assert resolve_model(named) == "bedrock-mantle-chat:google.gemma-4-31b"
    assert named.llm_base_url == GEMMA_URL


def test_an_unknown_profile_lists_the_valid_names_and_prints_no_secret():
    with pytest.raises(ValidationError) as refused:
        settings(
            llm_profile="gemma",
            session_secret="session-secret-value",
            firebase_service_account='{"private_key": "firebase-secret-value"}',
        )

    text = str(refused.value)
    for name in PROFILES:
        assert name in text
    for secret in (SECRET, "session-secret-value", "firebase-secret-value"):
        assert secret not in text


def test_the_worker_hands_the_profile_and_url_settings_to_the_app():
    env = SimpleNamespace(
        LLM_PROFILE="gemma-4-31b",
        LLM_BASE_URL="https://gateway.example.com/v1",
        LLM_BASE_URL_ALLOW="gateway.example.com",
        UNRELATED_BINDING=object(),
    )

    handed = deployment_environment(env)

    assert handed == {
        "LLM_PROFILE": "gemma-4-31b",
        "LLM_BASE_URL": "https://gateway.example.com/v1",
        "LLM_BASE_URL_ALLOW": "gateway.example.com",
    }
    assert set(handed) <= set(DEPLOYMENT_KEYS)
    named = Settings(**{**handed, "aws_bearer_token_bedrock": "k", "_env_file": None})
    assert named.llm_base_url == "https://gateway.example.com/v1"


def parsed(*argv: str, env_file: Path):
    from measure_stage_writing import add_profile_option

    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file")
    add_profile_option(parser)
    return parser.parse_args([*argv, "--env-file", str(env_file)])


def test_the_measurement_scripts_say_which_endpoint_they_hit(
    capsys, monkeypatch, tmp_path
):
    from measure_stage_writing import settings_from

    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "k")
    empty = tmp_path / ".env"
    empty.write_text("")

    chosen = settings_from(parsed("--profile", "gemma-4-31b", env_file=empty))

    out = capsys.readouterr().out
    assert chosen.llm_profile == "gemma-4-31b"
    assert (
        "profile=gemma-4-31b host=bedrock endpoint=bedrock-mantle.us-east-1.api.aws"
        in out
    )
    assert "bedrock-mantle-chat:google.gemma-4-31b" in out
    assert "overridden" not in out


def test_the_measurement_scripts_say_when_the_environment_overrode_the_flag(
    capsys, monkeypatch, tmp_path
):
    from measure_stage_writing import settings_from

    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "k")
    monkeypatch.setenv("LLM_MODEL_ID", "openai.gpt-oss-20b")
    empty = tmp_path / ".env"
    empty.write_text("")

    settings_from(parsed("--profile", "gemma-4-31b", env_file=empty))

    assert "overridden by the environment: LLM_MODEL_ID" in capsys.readouterr().out


def test_the_measurement_scripts_refuse_an_unknown_profile(tmp_path):
    with pytest.raises(SystemExit):
        parsed("--profile", "nope", env_file=tmp_path / ".env")
