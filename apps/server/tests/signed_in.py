"""A server whose Google sign-in vouches for one account, and the steps a
device takes through it."""

import httpx2

from app.factory import create_app
from app.learner.store import InMemoryLearnerStore
from app.security import firebase
from app.settings import Settings

DEVICE = "device-0001"
UID = "uid123"


def signed_in_app(monkeypatch, name: str = "Ada Lovelace"):
    async def verified(id_token, _api_key, **_):
        if id_token == "unchecked":
            raise firebase.SignInUnchecked("Sign-in could not be checked. Try again.")
        if id_token != "good":
            raise firebase.InvalidSignIn("The sign-in is not valid. Sign in again.")
        return firebase.SignedIn(uid=UID, name=name)

    monkeypatch.setattr("app.api.routes.verified", verified)
    return create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test",
            session_secret="s",
            firebase_api_key="key",
            _env_file=None,
        ),
        learners=InMemoryLearnerStore(),
    )


def client(app):
    return httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=app), base_url="http://test"
    )


def use(http, session: dict) -> dict:
    http.headers["Authorization"] = f"Bearer {session.get('token')}"
    return session


async def signed_in(http, **sent) -> dict:
    return use(http, (await http.post("/api/session", json=sent)).json())


async def added(http, name: str) -> str:
    response = await http.post(
        "/api/account/learners", json={"name": name, "guardian": True}
    )
    return response.json()["id"]


async def chosen(http, learner_id: str, device: str | None = None) -> dict:
    response = await http.post(
        f"/api/account/learners/{learner_id}/session",
        json={"deviceId": device} if device else {},
    )
    return use(http, response.json())


async def as_learner(http, device: str | None = DEVICE) -> str:
    """Signs in, adds a learner and chooses them, as a device's first sign-in
    does; the device's record joins the learner."""
    await signed_in(http, firebaseIdToken="good")
    learner_id = await added(http, "Ada")
    await chosen(http, learner_id, device)
    return learner_id
