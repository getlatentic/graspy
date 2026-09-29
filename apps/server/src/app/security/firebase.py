"""A Firebase ID token, verified by Google's Identity Toolkit. A Worker cannot
bundle the crypto a local check needs, and a token is checked once, when it is
exchanged for a session."""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup"
_UID = re.compile(r"^[A-Za-z0-9]{1,128}$")
# How recently a person must have signed in for what only they may decide.
FRESH_SIGN_IN_SECONDS = 5 * 60


class InvalidSignIn(Exception):
    """The message is sent to the client."""


class SignInUnchecked(Exception):
    """Google could not be asked, or failed to answer: the same token may pass on
    a later try. The message is sent to the client."""


def _google_failed(status: int) -> bool:
    """Identity Toolkit's own failures; any other status is its verdict on the token."""
    return status == 429 or status >= 500


@dataclass(frozen=True)
class SignedIn:
    uid: str
    # Google's name for the account, or empty.
    name: str
    # When the person last signed in, in epoch seconds, or None when the token does not say.
    auth_time: int | None = None

    def signed_in_within(self, seconds: int, now: float) -> bool:
        return self.auth_time is not None and now - self.auth_time <= seconds


def token_auth_time(id_token: str) -> int | None:
    """The token's `auth_time` claim. Read from a token Google has just accepted, so no signature
    is checked here."""
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(
            base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        )
    except IndexError, ValueError:
        return None
    auth_time = claims.get("auth_time") if isinstance(claims, dict) else None
    return auth_time if isinstance(auth_time, int) else None


def lookup_url(emulator_host: str | None) -> str:
    """The Auth emulator serves Identity Toolkit at its own address."""
    if emulator_host:
        return (
            f"http://{emulator_host}/identitytoolkit.googleapis.com/v1/accounts:lookup"
        )
    return LOOKUP_URL


async def verified(
    id_token: str,
    api_key: str,
    client: httpx.AsyncClient | None = None,
    *,
    url: str = LOOKUP_URL,
) -> SignedIn:
    """The project's key scopes the lookup: a token from another project is
    refused."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        response = await client.post(
            url, params={"key": api_key}, json={"idToken": id_token}
        )
    except httpx.HTTPError as error:
        logger.error("Identity Toolkit unreachable: %s", error)
        raise SignInUnchecked("Sign-in could not be checked. Try again.") from error
    finally:
        if own:
            await client.aclose()

    if _google_failed(response.status_code):
        logger.error(
            "Identity Toolkit failed (%s): %s",
            response.status_code,
            response.text[:200],
        )
        raise SignInUnchecked("Sign-in could not be checked. Try again.")
    if response.status_code != 200:
        logger.info("Identity Toolkit refused a token: %s", response.text[:200])
        raise InvalidSignIn("The sign-in is not valid. Sign in again.")
    users = response.json().get("users") or []
    user = users[0] if users else {}
    uid = user.get("localId")
    if not isinstance(uid, str) or not _UID.match(uid):
        raise InvalidSignIn("The sign-in is not valid. Sign in again.")
    name = user.get("displayName")
    return SignedIn(
        uid=uid,
        name=name if isinstance(name, str) else "",
        auth_time=token_auth_time(id_token),
    )
