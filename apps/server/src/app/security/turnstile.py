"""Cloudflare Turnstile, checked by Siteverify before a visitor's session is signed (the web's /try).
A session for a visitor with no account is the one way to spend model credits unsigned, so the start
of a visit must be a person's browser. A token is single use: Siteverify refuses one it has already
answered, so a replayed or shared token never mints a second session.

Failing closed: when Siteverify cannot be asked, or answers with a fault of ours (a wrong secret),
nothing is admitted."""

from __future__ import annotations

import logging
from collections.abc import Callable
from enum import StrEnum

import httpx

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
# The widget on /try is rendered with this action, and Siteverify returns it with the verdict.
CHALLENGE_ACTION = "try"
# Cloudflare's tokens are at most this long.
MAX_TOKEN_LENGTH = 2048
SITEVERIFY_TIMEOUT_SECONDS = 5.0

# Cloudflare's published test secrets (developers.cloudflare.com/turnstile/troubleshooting/testing).
# They give no protection: the first passes every token, the others fail every one (the third
# with a token-already-spent error).
ALWAYS_PASSES = "1x0000000000000000000000000000000AA"
ALWAYS_FAILS = "2x0000000000000000000000000000000AA"
ALWAYS_FAILS_SPENT = "3x0000000000000000000000000000000AA"
TEST_SECRETS = frozenset({ALWAYS_PASSES, ALWAYS_FAILS, ALWAYS_FAILS_SPENT})

# Errors that say the secret or the request is wrong on our side, not that the visitor failed.
_OUR_FAULT = frozenset(
    {"missing-input-secret", "invalid-input-secret", "bad-request", "internal-error"}
)


class ChallengeMode(StrEnum):
    OFF = "off"
    LIVE = "live"
    TEST_PASSES = "test-always-passes"
    TEST_FAILS = "test-always-fails"


def mode_of(secret: str | None) -> ChallengeMode:
    if not secret:
        return ChallengeMode.OFF
    if secret == ALWAYS_PASSES:
        return ChallengeMode.TEST_PASSES
    if secret in (ALWAYS_FAILS, ALWAYS_FAILS_SPENT):
        return ChallengeMode.TEST_FAILS
    return ChallengeMode.LIVE


class ChallengeRefused(Exception):
    """The token is not a passed, unspent challenge of this site's."""


class ChallengeUnchecked(Exception):
    """Siteverify could not be asked or could not judge: the same token may pass on a later try."""


def _site_allowed(hostname: object, origin_allowed: Callable[[str], bool]) -> bool:
    """The widget ran on a site the web app is served from: the same rules as CORS, which the
    origins are."""
    return isinstance(hostname, str) and origin_allowed(f"https://{hostname.lower()}")


async def _answer(client: httpx.AsyncClient, form: dict[str, str]) -> dict:
    try:
        response = await client.post(SITEVERIFY_URL, data=form)
    except httpx.HTTPError as error:
        logger.error("Siteverify unreachable: %s", type(error).__name__)
        raise ChallengeUnchecked from error
    if response.status_code != 200:
        logger.error("Siteverify answered %s", response.status_code)
        raise ChallengeUnchecked
    try:
        body = response.json()
    except ValueError as error:
        logger.error("Siteverify answered with something that is not JSON")
        raise ChallengeUnchecked from error
    if not isinstance(body, dict):
        raise ChallengeUnchecked
    return body


def _judged(body: dict, *, secret: str, origin_allowed: Callable[[str], bool]) -> None:
    if body.get("success") is not True:
        listed = body.get("error-codes")
        codes = (
            {c for c in listed if isinstance(c, str)}
            if isinstance(listed, list)
            else set()
        )
        if codes & _OUR_FAULT:
            logger.error("Siteverify could not judge a token: %s", sorted(codes))
            raise ChallengeUnchecked
        raise ChallengeRefused
    # The test secrets answer for example.com and name no action; they protect nothing either way.
    if secret in TEST_SECRETS:
        return
    if body.get("action") != CHALLENGE_ACTION:
        raise ChallengeRefused
    if not _site_allowed(body.get("hostname"), origin_allowed):
        raise ChallengeRefused


async def verify_challenge(
    token: str,
    secret: str,
    *,
    client_address: str | None,
    origin_allowed: Callable[[str], bool],
    client: httpx.AsyncClient | None = None,
) -> None:
    """Returns when `token` is a passed, unspent challenge from a site `origin_allowed` accepts for the action of
    /try. `client_address` is the address the edge reported, or None."""
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise ChallengeRefused
    form = {"secret": secret, "response": token}
    if client_address:
        form["remoteip"] = client_address
    own = client is None
    client = client or httpx.AsyncClient(timeout=SITEVERIFY_TIMEOUT_SECONDS)
    try:
        body = await _answer(client, form)
    finally:
        if own:
            await client.aclose()
    _judged(body, secret=secret, origin_allowed=origin_allowed)
