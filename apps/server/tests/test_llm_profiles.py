"""LLM_PROFILE: a host, model id and base URL chosen by name."""

import argparse
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.llm.client import resolve_model
from app.llm.hosts import HOSTS, host_of
from app.llm.profiles import PROFILES
from app.settings import DEPLOYMENT_KEYS, Settings

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

BASE = {
    "aws_bearer_token_bedrock": "k",
    "cloudflare_account_id": "acct",
    "cloudflare_api_token": "cf",
    "_env_file": None,
}


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
    assert HOSTS["bedrock"].config(plain, None).base_urls is None


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
            "openai-chat:google.gemma-4-31b",
            "https://bedrock-mantle.us-east-1.api.aws/openai/v1",
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


def test_the_gemma_profile_sends_to_the_openai_path():
    config = HOSTS["bedrock"].config(settings(llm_profile="gemma-4-31b"), None)

    assert config.base_urls == {
        "openai-chat": "https://bedrock-mantle.us-east-1.api.aws/openai/v1"
    }


def test_explicit_settings_win_over_the_profile():
    named = settings(
        llm_profile="gemma-4-31b",
        llm_model_id="google.gemma-4-12b",
        llm_base_url="https://gateway.example.com/v1",
    )

    assert resolve_model(named) == "openai-chat:google.gemma-4-12b"
    assert named.llm_base_url == "https://gateway.example.com/v1"
    assert settings(llm_profile="gemma-4-31b", llm_host="workers-ai").llm_host == (
        "workers-ai"
    )


def test_blank_settings_do_not_hide_the_profile():
    named = settings(llm_profile="gemma-4-31b", llm_model_id="", llm_base_url="")

    assert resolve_model(named) == "openai-chat:google.gemma-4-31b"


def test_an_unknown_profile_is_refused_with_the_valid_names():
    with pytest.raises(ValidationError) as refused:
        settings(llm_profile="gemma")

    for name in PROFILES:
        assert name in str(refused.value)


def test_the_worker_passes_the_profile_through():
    assert "LLM_PROFILE" in DEPLOYMENT_KEYS


def test_the_measurement_scripts_take_a_profile(capsys, monkeypatch):
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "k")
    from measure_stage_writing import add_profile_option, settings_from

    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file")
    add_profile_option(parser)

    chosen = settings_from(parser.parse_args(["--profile", "gemma-4-31b"]))

    assert chosen.llm_profile == "gemma-4-31b"
    assert (
        "profile=gemma-4-31b openai-chat:google.gemma-4-31b" in capsys.readouterr().out
    )
    with pytest.raises(SystemExit):
        parser.parse_args(["--profile", "nope"])
