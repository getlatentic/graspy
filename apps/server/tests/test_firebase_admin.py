"""Removing a Firebase user: the service account's token is made once and kept, and every way
Google can fail ends as a failure the caller can ask again after."""

import base64
import json

import httpx
import pytest

from app.security.firebase_admin import (
    FirebaseAdmin,
    NotConfigured,
    RemovalFailed,
    ServiceAccount,
    configured,
)
from app.settings import Settings

KEY = json.dumps(
    {
        "client_email": "remover@graspy-f482e.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
        "project_id": "graspy-f482e",
    }
)
DELETE_URL = (
    "https://identitytoolkit.googleapis.com/v1/projects/graspy-f482e/accounts:delete"
)
TOKEN_URL = "https://oauth2.googleapis.com/token"


async def sign(pem: str, message: bytes) -> bytes:
    return b"signed:" + message[-4:]


class Google:
    """Answers as Google does, and remembers what it was asked."""

    def __init__(self, deleting=200, token=200, delete_body="{}", token_body=None):
        self.deleting, self.token, self.delete_body = deleting, token, delete_body
        self.token_body = (
            {"access_token": "ya29.token", "expires_in": 3599}
            if token_body is None
            else token_body
        )
        self.asked: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.asked.append(request)
        if str(request.url) == TOKEN_URL:
            return httpx.Response(self.token, json=self.token_body)
        return httpx.Response(self.deleting, text=self.delete_body)


def admin(google: Google) -> FirebaseAdmin:
    return FirebaseAdmin(
        ServiceAccount.parse(KEY), sign, transport=httpx.MockTransport(google)
    )


async def test_the_user_is_deleted_with_the_service_accounts_token():
    google = Google()

    await admin(google).remove_user("uid123")

    token, delete = google.asked
    form = dict(httpx.QueryParams(token.content.decode()))
    assert form["grant_type"] == "urn:ietf:params:oauth:grant-type:jwt-bearer"
    header, claims, signature = form["assertion"].split(".")
    assert json.loads(base64.urlsafe_b64decode(header + "==")) == {
        "alg": "RS256",
        "typ": "JWT",
    }
    claims = json.loads(base64.urlsafe_b64decode(claims + "=="))
    assert claims["iss"] == "remover@graspy-f482e.iam.gserviceaccount.com"
    assert claims["aud"] == TOKEN_URL
    assert claims["exp"] - claims["iat"] == 3600
    assert base64.urlsafe_b64decode(signature + "==").startswith(b"signed:")
    assert str(delete.url) == DELETE_URL
    assert delete.headers["Authorization"] == "Bearer ya29.token"
    assert json.loads(delete.content) == {"localId": "uid123"}


async def test_the_token_is_made_once_for_deletions_after():
    google = Google()
    remover = admin(google)

    await remover.remove_user("a")
    await remover.remove_user("b")

    assert [str(one.url) for one in google.asked] == [TOKEN_URL, DELETE_URL, DELETE_URL]


async def test_a_user_who_is_already_gone_counts_as_deleted():
    google = Google(deleting=400, delete_body='{"error":{"message":"USER_NOT_FOUND"}}')

    await admin(google).remove_user("uid123")


@pytest.mark.parametrize(
    "google",
    [
        Google(deleting=500),
        Google(deleting=429),
        Google(deleting=403, delete_body="PERMISSION_DENIED"),
        Google(deleting=400, delete_body='{"error":{"message":"INVALID_LOCAL_ID"}}'),
        Google(token=400),
        Google(token_body={"expires_in": 3599}),
        Google(token_body=[]),
    ],
)
async def test_a_refusal_or_failure_of_google_is_a_removal_that_failed(google):
    with pytest.raises(RemovalFailed):
        await admin(google).remove_user("uid123")


async def test_a_google_that_cannot_be_reached_is_a_removal_that_failed():
    def down(request):
        raise httpx.ConnectError("no route", request=request)

    remover = FirebaseAdmin(
        ServiceAccount.parse(KEY), sign, transport=httpx.MockTransport(down)
    )

    with pytest.raises(RemovalFailed):
        await remover.remove_user("uid123")


async def test_the_auth_emulator_is_asked_with_no_token():
    google = Google()
    remover = FirebaseAdmin(
        None,
        sign,
        emulator_host="127.0.0.1:9099",
        project="demo-graspy",
        transport=httpx.MockTransport(google),
    )

    await remover.remove_user("uid123")

    [asked] = google.asked
    assert asked.url.host == "127.0.0.1"
    assert asked.url.path.endswith("/projects/demo-graspy/accounts:delete")


@pytest.mark.parametrize(
    "text",
    [
        "",
        "{}",
        "[]",
        '{"client_email": 1}',
        "nonsense",
        KEY.replace("AAAA", "not base64 !"),
    ],
)
def test_a_secret_that_is_not_a_service_account_key_is_refused(text):
    with pytest.raises(NotConfigured):
        ServiceAccount.parse(text)


def test_there_is_nothing_to_remove_from_where_firebase_is_not_configured():
    assert configured(Settings(_env_file=None)) is None


def test_a_deployed_server_with_sign_in_needs_the_service_account():
    deployed = {"app_env": "staging", "session_secret": "s", "firebase_api_key": "k"}

    with pytest.raises(ValueError, match="FIREBASE_SERVICE_ACCOUNT"):
        Settings(_env_file=None, **deployed)
    assert Settings(_env_file=None, firebase_service_account=KEY, **deployed)
    assert Settings(_env_file=None, app_env="staging", session_secret="s")


async def test_a_token_google_no_longer_accepts_is_made_again_once():
    class Revoked(Google):
        def __call__(self, request):
            answer = super().__call__(request)
            if str(request.url) == DELETE_URL and len(self.asked) == 2:
                return httpx.Response(401, text="UNAUTHENTICATED")
            return answer

    google = Revoked()

    await admin(google).remove_user("uid123")

    assert [str(one.url) for one in google.asked] == [
        TOKEN_URL,
        DELETE_URL,
        TOKEN_URL,
        DELETE_URL,
    ]


async def test_a_token_google_keeps_refusing_is_one_retry_and_a_failed_removal():
    google = Google(deleting=401)

    with pytest.raises(RemovalFailed):
        await admin(google).remove_user("uid123")

    assert len(google.asked) == 4


async def test_a_signer_that_fails_is_a_removal_that_failed():
    async def broken(pem, message):
        raise RuntimeError("importKey: parameter 5 is not of type 'Array'")

    remover = FirebaseAdmin(
        ServiceAccount.parse(KEY), broken, transport=httpx.MockTransport(Google())
    )

    with pytest.raises(RemovalFailed):
        await remover.remove_user("uid123")


async def test_the_assertion_is_signed_with_the_accounts_own_key():
    """What Google verifies: the signature of the key's public half over the JWT."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    from app.security.firebase_admin import signed_assertion
    from app.security.rs256_worker import pkcs8_der

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    assert pkcs8_der(pem) == key.private_bytes(
        serialization.Encoding.DER,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )

    async def sign(given: str, message: bytes) -> bytes:
        loaded = serialization.load_pem_private_key(given.encode(), None)
        return loaded.sign(message, padding.PKCS1v15(), hashes.SHA256())

    account = ServiceAccount("remover@x.iam.gserviceaccount.com", pem, "graspy-f482e")
    jwt = await signed_assertion(account, sign, 1_000_000)

    unsigned, signature = jwt.rsplit(".", 1)
    key.public_key().verify(
        base64.urlsafe_b64decode(signature + "=="),
        unsigned.encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
