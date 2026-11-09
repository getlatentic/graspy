"""Removing a person's sign-in record (their email and name) from Firebase when their graspy
account is deleted. It acts as a service account that may only delete users: a Google OAuth
token is made from the account's key, then Identity Toolkit's admin API deletes the user."""

from __future__ import annotations

import base64
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx

from .rs256_worker import pkcs8_der, rs256_in_worker

TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/identitytoolkit"
ADMIN_URL = (
    "https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts:delete"
)
EMULATOR_URL = (
    "http://{host}/identitytoolkit.googleapis.com/v1/projects/{project}/accounts:delete"
)
TIMEOUT_SECONDS = 15.0
TOKEN_SECONDS = 3600
# A token is made again this long before it expires.
TOKEN_MARGIN_SECONDS = 300

Signer = Callable[[str, bytes], Awaitable[bytes]]


class RemovalFailed(Exception):
    """Firebase did not remove the user: asking again may. The message is for the log."""


class NotConfigured(ValueError):
    """The service account is not the JSON key Google issues."""


@dataclass(frozen=True)
class ServiceAccount:
    email: str
    private_key: str
    project: str

    @classmethod
    def parse(cls, text: str) -> ServiceAccount:
        try:
            key = json.loads(text)
            pkcs8_der(key["private_key"])
            return cls(
                email=key["client_email"],
                private_key=key["private_key"],
                project=key["project_id"],
            )
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise NotConfigured(
                "FIREBASE_SERVICE_ACCOUNT is not a service account key"
            ) from error


def _encoded(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


async def signed_assertion(account: ServiceAccount, sign: Signer, now: float) -> str:
    """The JWT that Google's token endpoint exchanges for an access token."""
    issued = int(now)
    claims = {
        "iss": account.email,
        "scope": SCOPE,
        "aud": TOKEN_URL,
        "iat": issued,
        "exp": issued + TOKEN_SECONDS,
    }
    header = {"alg": "RS256", "typ": "JWT"}
    unsigned = ".".join(
        _encoded(json.dumps(part).encode()) for part in (header, claims)
    )
    signature = await sign(account.private_key, unsigned.encode())
    return f"{unsigned}.{_encoded(signature)}"


class FirebaseAdmin:
    """One per app. Holds the access token it made, so a deletion is one request, not two."""

    def __init__(
        self,
        account: ServiceAccount | None,
        sign: Signer,
        *,
        emulator_host: str | None = None,
        project: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._account = account
        self._sign = sign
        self._emulator_host = emulator_host
        self._project = account.project if account else project
        self._transport = transport
        self._token: tuple[str, float] | None = None

    async def remove_user(self, uid: str) -> None:
        """Deletes the Firebase user; one already gone counts as deleted."""
        async with httpx.AsyncClient(
            timeout=TIMEOUT_SECONDS, transport=self._transport
        ) as client:
            try:
                response = await self._delete(client, uid)
                if response.status_code == 401:
                    # The token Google gave is no longer accepted: one made now is tried once.
                    self._token = None
                    response = await self._delete(client, uid)
            except httpx.HTTPError as error:
                raise RemovalFailed(f"Identity Toolkit unreachable: {error}") from error
        if response.status_code == 200 or _user_not_found(response):
            return
        raise RemovalFailed(
            f"Identity Toolkit refused the deletion ({response.status_code}): {response.text[:200]}"
        )

    async def _delete(self, client: httpx.AsyncClient, uid: str) -> httpx.Response:
        if self._emulator_host:
            url = EMULATOR_URL.format(host=self._emulator_host, project=self._project)
            bearer = "owner"
        else:
            url = ADMIN_URL.format(project=self._project)
            bearer = await self._access_token(client)
        return await client.post(
            url, json={"localId": uid}, headers={"Authorization": f"Bearer {bearer}"}
        )

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        now = time.time()
        if self._token and self._token[1] - TOKEN_MARGIN_SECONDS > now:
            return self._token[0]
        assert self._account is not None
        try:
            assertion = await signed_assertion(self._account, self._sign, now)
        except (
            Exception
        ) as error:  # the signer is the runtime's, and raises its own types
            raise RemovalFailed(
                f"The token request could not be signed: {error}"
            ) from error
        response = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        if response.status_code != 200:
            raise RemovalFailed(
                f"Google refused the service account ({response.status_code}): {response.text[:200]}"
            )
        try:
            body = response.json()
            self._token = (
                body["access_token"],
                now + float(body.get("expires_in", TOKEN_SECONDS)),
            )
        except (ValueError, KeyError, TypeError) as error:
            raise RemovalFailed(
                "Google's token reply was not an access token"
            ) from error
        return self._token[0]


EMULATOR_PROJECT = "demo-graspy"


def configured(settings, sign: Signer | None = None) -> FirebaseAdmin | None:
    """The remover for these settings, or None where there is no Firebase to remove from: a
    local server with neither the Auth emulator nor a service account."""
    if settings.firebase_auth_emulator_host:
        return FirebaseAdmin(
            None,
            sign or rs256_in_worker,
            emulator_host=settings.firebase_auth_emulator_host,
            project=EMULATOR_PROJECT,
        )
    if settings.firebase_service_account:
        account = ServiceAccount.parse(settings.firebase_service_account)
        return FirebaseAdmin(account, sign or rs256_in_worker)
    return None


def _user_not_found(response: httpx.Response) -> bool:
    if response.status_code != 400:
        return False
    return "USER_NOT_FOUND" in response.text
