# ruff: noqa: F811
"""What a passed Turnstile challenge is worth: how long a visitor's session may be renewed from it,
and which environments may run on Cloudflare's test secrets."""

import pytest
from test_visitor_challenge import (  # noqa: F401  (fixtures)
    claims_of,
    client,
    code_of,
    mint,
    siteverify,
)

from app.security.turnstile import (
    ALWAYS_FAILS_SPENT,
    TEST_SECRETS,
    ChallengeMode,
    mode_of,
)
from app.settings import Settings


@pytest.mark.parametrize("env", ["production", "prod", "preview", "qa", "staging-2"])
@pytest.mark.parametrize("secret", sorted(TEST_SECRETS))
def test_no_environment_but_development_test_and_staging_may_use_a_test_secret(
    env, secret
):
    with pytest.raises(ValueError, match="published test secrets"):
        Settings(
            app_env=env, session_secret="s", turnstile_secret=secret, _env_file=None
        )


@pytest.mark.parametrize("env", ["development", "dev", "test", "local", "staging"])
@pytest.mark.parametrize("secret", sorted(TEST_SECRETS))
def test_development_test_and_staging_may_use_a_test_secret(env, secret):
    assert Settings(
        app_env=env, session_secret="s", turnstile_secret=secret, _env_file=None
    )


def test_the_third_test_secret_is_one_that_fails_everyone():
    assert ALWAYS_FAILS_SPENT in TEST_SECRETS
    assert mode_of(ALWAYS_FAILS_SPENT) is ChallengeMode.TEST_FAILS


def test_a_challenge_is_renewed_into_two_sessions_and_no_more(client, siteverify):
    first = mint(client, challenge="t")
    second = mint(client, renewal=first.json()["token"])
    third = mint(client, renewal=second.json()["token"])
    fourth = mint(client, renewal=third.json()["token"])

    assert [claims_of(r)["ren"] for r in (first, second, third)] == [0, 1, 2]
    assert (fourth.status_code, code_of(fourth)) == (403, "challenge_required")
    assert len(siteverify.asked) == 1


def test_a_visitor_asked_for_a_challenge_is_told_to_reload(client):
    assert "Reload" in mint(client).json()["detail"]["error"]
