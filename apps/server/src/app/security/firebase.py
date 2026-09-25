"""A Firebase ID token, verified by Google's Identity Toolkit. A Worker cannot
bundle the crypto a local check needs, and a token is checked once, when it is
exchanged for a session."""

from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger(__name__)

LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup"
_UID = re.compile(r"^[A-Za-z0-9]{1,128}$")


class InvalidSignIn(Exception):
    """The message is sent to the client."""


def account_learner(uid: str) -> str:
    """Device ids have no colon, so an account can never be taken for one."""
    return f"account:{uid}"


async def verified_uid(
    id_token: str, api_key: str, client: httpx.AsyncClient | None = None
) -> str:
    """The project's key scopes the lookup: a token from another project is
    refused."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        response = await client.post(
            LOOKUP_URL, params={"key": api_key}, json={"idToken": id_token}
        )
    except httpx.HTTPError as error:
        logger.error("Identity Toolkit unreachable: %s", error)
        raise InvalidSignIn("Sign-in could not be checked. Try again.") from error
    finally:
        if own:
            await client.aclose()

    if response.status_code != 200:
        logger.info("Identity Toolkit refused a token: %s", response.text[:200])
        raise InvalidSignIn("The sign-in is not valid. Sign in again.")
    users = response.json().get("users") or []
    uid = users[0].get("localId") if users else None
    if not isinstance(uid, str) or not _UID.match(uid):
        raise InvalidSignIn("The sign-in is not valid. Sign in again.")
    return uid
