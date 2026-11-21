"""The Bedrock base URLs the tutor Worker (apps/tutor/tests/bedrock-url.test.ts)
is tested with too, so the two checks cannot drift."""

import json
from pathlib import Path

import pytest
from test_llm_base_url import settings

from app.llm.hosts import HOSTS, host_of

CORPUS = json.loads(
    (
        Path(__file__).resolve().parents[3] / "tests/fixtures/llm-base-urls.json"
    ).read_text(encoding="utf-8")
)
BEDROCK = HOSTS["bedrock"]


@pytest.mark.parametrize("case", CORPUS["origins"], ids=lambda case: case["url"])
def test_an_origin_is_accepted_and_kept_as_a_lower_case_origin(case):
    chosen = settings(llm_base_url=case["url"])

    assert host_of(chosen) is BEDROCK
    assert BEDROCK.base_url(chosen) == case["origin"]
    region = case["origin"].split(".")[1]
    config = BEDROCK.config(chosen, None)
    assert config.settings == {"bedrock-mantle-chat": {"region": region}}


@pytest.mark.parametrize("case", CORPUS["paths"], ids=lambda case: case["url"])
def test_a_plain_path_is_accepted_as_the_server_takes_it(case):
    assert BEDROCK.base_url(settings(llm_base_url=case["url"])) == case["server"]


@pytest.mark.parametrize("case", CORPUS["refused"], ids=lambda case: repr(case["url"]))
def test_a_url_both_checks_refuse_is_refused_with_its_reason(case):
    chosen = settings(llm_base_url=case["url"])

    with pytest.raises(RuntimeError, match=case["server"]) as refused:
        BEDROCK.config(chosen, None)

    assert case["url"] not in str(refused.value)
