"""Stand-ins for the Worker's voice bindings, in the shapes the Workers
runtime hands Python: D1 rows as dicts and a write's result with ``meta``,
an R2 listing as a dict of objects that carry ``key``, and the tutor Worker
behind a service binding. Checked against `npm run worker:dev`."""

import json
import sqlite3
from types import SimpleNamespace
from urllib.parse import unquote, urlsplit

from signed_in import UID

from app.factory import create_app
from app.learner.store import InMemoryLearnerStore
from app.local_d1 import LocalD1
from app.security import firebase
from app.settings import Settings


class Database(LocalD1):
    """D1, as the moved tests build it: SQLite from the migrations."""

    @property
    def db(self) -> sqlite3.Connection:
        return self.connection

    def rows(self, sql: str, *values) -> list[dict]:
        return [dict(row) for row in self.connection.execute(sql, values)]


class Stored:
    def __init__(self, data: bytes) -> None:
        self._data = data

    async def bytes(self) -> memoryview:
        return memoryview(self._data)

    async def arrayBuffer(self) -> memoryview:
        return memoryview(self._data)


class Bucket:
    """R2, listing a few keys a page so forgetting has to page."""

    PAGE = 2

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.types: dict[str, str] = {}

    async def get(self, key: str) -> Stored | None:
        found = self.objects.get(key)
        return None if found is None else Stored(found)

    async def put(self, key: str, data: bytes, httpMetadata=None) -> None:
        self.objects[key] = bytes(data)
        self.types[key] = (httpMetadata or {}).get("contentType", "")

    async def list(self, prefix: str = "", cursor: str | None = None) -> dict:
        """R2's cursor names the last key listed, so deleting a page as it is
        read skips nothing."""
        keys = sorted(
            key
            for key in self.objects
            if key.startswith(prefix) and (cursor is None or key > cursor)
        )
        page, more = keys[: self.PAGE], len(keys) > self.PAGE
        return {
            "objects": [SimpleNamespace(key=key) for key in page],
            "truncated": more,
            "cursor": page[-1] if more else None,
            "delimitedPrefixes": [],
        }

    async def delete(self, keys: list[str]) -> None:
        for key in keys:
            self.objects.pop(key, None)


class Answer:
    def __init__(self, body: dict, status: int = 200) -> None:
        self.status, self._body = status, body

    async def json(self) -> dict:
        return self._body


class Tutor:
    """The tutor Worker: records each action it was asked for, by learner."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []
        self.verdict = "correct"

    async def fetch(self, url: str, method: str, headers: dict, body: str) -> Answer:
        *_, learner, action = urlsplit(url).path.split("/")
        sent = json.loads(body)
        self.calls.append((unquote(learner), action, sent))
        return Answer(self._answer(action))

    def _answer(self, action: str) -> dict:
        if action == "sitting":
            return {"due": [], "fresh": []}
        if action == "teach":
            return {
                "verdict": self.verdict,
                "expected": "14",
                "said": "14",
                "say": "Well done.",
            }
        if action == "forget":
            return {"forgotten": True}
        return {"stability": 1.0, "applied": True}

    def actions(self, learner: str) -> list[str]:
        return [action for who, action, _ in self.calls if who == learner]


class Models:
    """Workers AI: the tests never need a model, so a call is a failure."""

    async def run(self, model, inputs):
        raise AssertionError(f"no model call was expected, got {model}")


def worker_env() -> SimpleNamespace:
    return SimpleNamespace(
        DB=Database(),
        AUDIO=Bucket(),
        TUTOR=Tutor(),
        AI=Models(),
        INTRON_API_KEY="intron-test",
        SPITCH_API_KEY="spitch-test",
    )


def voice_app(monkeypatch, env=None):
    """The app over these bindings, with Google's sign-in vouching for UID."""

    async def verified(id_token, _api_key, **_):
        if id_token != "good":
            raise firebase.InvalidSignIn("The sign-in is not valid. Sign in again.")
        return firebase.SignedIn(uid=UID, name="Ada")

    monkeypatch.setattr("app.api.routes.verified", verified)
    return create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test",
            session_secret="s",
            firebase_api_key="key",
            _env_file=None,
        ),
        learners=InMemoryLearnerStore(),
        voice=env,
    )
