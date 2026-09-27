"""How the Worker builds the app from its bindings, with stand-in bindings."""

import json
import os
import uuid
from types import SimpleNamespace

import dspy
import httpx
import pytest
from a2a.client import ClientConfig, create_client
from a2a.helpers.proto_helpers import new_text_part
from a2a.types import Message, Role, SendMessageRequest
from dspy.utils.dummies import DummyLM
from fastapi.testclient import TestClient
from lesson_example import LESSON, wire

from app.cloudflare import (
    BindingLimiter,
    build_lesson_runner,
    build_worker_app,
    deployment_environment,
)
from app.learner.record import Learnt, TopicRef, changed
from app.learner.store import DurableObjectLearnerStore
from app.lessons.making import Job, LessonTarget, started
from app.lessons.store import DurableObjectLessonStore
from app.local_d1 import LocalD1
from app.mcp.sandbox import build_of
from app.settings import DEPLOYMENT_KEYS
from app.threads.wire import SentThreads

VARS = {
    "APP_ENV": "development",
    "SESSION_SECRET": "worker-secret",
    "AWS_BEARER_TOKEN_BEDROCK": "bedrock-test",
    "PUBLIC_BASE_URL": "https://api.example",
    "CORS_ORIGINS": "https://app.example",
}


class FakeLimiterBinding:
    def __init__(self, success: bool = True):
        self.success, self.calls = success, []

    async def limit(self, options):
        self.calls.append(options)
        return SimpleNamespace(success=self.success)


class FakeConversations:
    """The Durable Object namespace, recording what each conversation stores."""

    def __init__(self):
        self.stored: dict[str, list[dict]] = {}

    def getByName(self, name: str):
        stored = self.stored.setdefault(name, [])

        class Stub:
            async def load(self) -> str:
                return json.dumps(stored)

            async def append(self, exchange_json: str) -> None:
                stored.append(json.loads(exchange_json))

        return Stub()


class FakeLessons:
    """The lessons' Durable Object namespace."""

    def __init__(self):
        self.stored: dict[str, str] = {}

    def getByName(self, name: str):
        stored = self.stored

        class Stub:
            async def keep(self, lesson_json: str) -> None:
                stored[name] = lesson_json

            async def find(self) -> str:
                return stored.get(name, "")

        return Stub()


class FakeLearners:
    """The learners' Durable Object namespace, changing a record as the
    object does."""

    def __init__(self):
        self.stored: dict[str, str] = {}

    def getByName(self, name: str):
        stored = self.stored

        class Stub:
            async def load(self) -> str:
                return stored.get(name, "")

            async def change(self, change_json: str) -> None:
                stored[name] = changed(stored.get(name), change_json)

        return Stub()


class FakeLessonMakers:
    """The lesson makers' Durable Object namespace: starting as the object
    does, and noting each alarm it would set."""

    def __init__(self):
        self.stored: dict[str, str] = {}
        self.alarms: list[str] = []

    def getByName(self, name: str):
        makers = self

        class Stub:
            async def start(self, job_json: str) -> str:
                answer, run = started(makers.stored.get(name), job_json, 1_000)
                if run:
                    makers.stored[name] = answer
                    makers.alarms.append(name)
                return answer

            async def progress(self) -> str:
                return makers.stored.get(name, "")

        return Stub()


LIMITERS = ("SESSION_LIMITER", "GENERATE_LIMITER", "AGENT_LIMITER", "API_LIMITER")
VIEW = "<!doctype html><html><head><title>practice</title></head></html>"
WORKER = "// the views' build's sandbox worker"
BUILT = {"/views/practice.html": VIEW, "/views/ui-sandbox-sw.js": WORKER}


class FakeAssets:
    """The ASSETS binding: fetch by URL, a Response with ok and text()."""

    def __init__(self):
        self.fetched: list[str] = []

    async def fetch(self, url: str):
        self.fetched.append(url)
        built = next((body for path, body in BUILT.items() if url.endswith(path)), None)

        async def text():
            return built

        return SimpleNamespace(ok=built is not None, text=text)


def fake_env(**limiter_success) -> SimpleNamespace:
    limiters = {
        name: FakeLimiterBinding(limiter_success.get(name, True)) for name in LIMITERS
    }
    return SimpleNamespace(
        **VARS,
        **limiters,
        CONVERSATIONS=FakeConversations(),
        LESSONS=FakeLessons(),
        LEARNERS=FakeLearners(),
        LESSON_MAKERS=FakeLessonMakers(),
        ASSETS=FakeAssets(),
        DB=LocalD1(),
    )


@pytest.fixture(autouse=True)
def restore_environment():
    """build_worker_app copies bindings into the process environment."""
    saved = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(saved)


def test_only_declared_configuration_is_read_from_env():
    env = SimpleNamespace(
        APP_ENV="production",
        CONVERSATIONS=object(),
        LESSONS=object(),
        SESSION_LIMITER=object(),
    )

    assert deployment_environment(env) == {"APP_ENV": "production"}


def test_values_become_strings_and_absent_keys_are_skipped():
    env = SimpleNamespace(LLM_MODEL_ID=123)

    assert deployment_environment(env) == {"LLM_MODEL_ID": "123"}
    assert set(deployment_environment(SimpleNamespace())) == set()


def test_every_declared_key_is_a_setting():
    """A key the settings never read would be copied and silently ignored."""
    from app.settings import Settings

    aliases = {field.alias for field in Settings.model_fields.values() if field.alias}
    assert set(DEPLOYMENT_KEYS) <= aliases | {"CORS_ORIGINS"}


async def test_a_binding_limiter_asks_the_binding_with_a_converted_key():
    binding = FakeLimiterBinding(success=False)
    converted = []

    limiter = BindingLimiter(
        binding, js_object=lambda value: converted.append(value) or "JS"
    )

    assert await limiter.allow("198.51.100.7") is False
    assert converted == [{"key": "198.51.100.7"}]
    assert binding.calls == ["JS"]


def test_the_worker_app_reads_its_configuration_from_the_bindings():
    app = build_worker_app(fake_env(), js_object=lambda value: value)

    assert app.state.settings.session_secret == "worker-secret"
    assert app.state.settings.public_base_url == "https://api.example"
    assert TestClient(app).get("/api/health").status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "binding"),
    [
        ("POST", "/api/session", "SESSION_LIMITER"),
        ("GET", "/api/curriculum/generate-stream", "GENERATE_LIMITER"),
        ("POST", "/a2a", "AGENT_LIMITER"),
        ("GET", "/api/health", "API_LIMITER"),
    ],
)
def test_each_route_spends_the_budget_of_its_own_binding(method, path, binding):
    env = fake_env(**{binding: False})
    app = build_worker_app(env, js_object=lambda value: {"converted": value})

    response = TestClient(app).request(
        method, path, headers={"cf-connecting-ip": "198.51.100.7"}
    )

    assert response.status_code == 429
    assert getattr(env, binding).calls == [{"converted": {"key": "198.51.100.7"}}]
    assert [name for name in LIMITERS if getattr(env, name).calls] == [binding]


async def test_the_tutor_remembers_a_conversation_in_the_durable_object():
    env = fake_env()
    app = build_worker_app(env, js_object=lambda value: value)
    adapter = dspy.JSONAdapter()
    lm = DummyLM(
        [
            {
                "next_thought": "I can answer",
                "next_tool_name": "finish",
                "next_tool_args": {},
            },
            {"reasoning": "r", "answer": "Forty-two", "follow_ups": []},
        ],
        adapter=adapter,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        http.headers["Authorization"] = (
            f"Bearer {(await http.post('/api/session')).json()['token']}"
        )
        client = await create_client(
            "http://test", client_config=ClientConfig(httpx_client=http)
        )
        message = Message(
            message_id=str(uuid.uuid4()),
            role=Role.ROLE_USER,
            parts=[new_text_part("6 times 7?")],
        )
        with dspy.context(lm=lm, adapter=adapter):
            events = [
                event
                async for event in client.send_message(
                    SendMessageRequest(message=message)
                )
            ]

    [(conversation, exchanges)] = env.CONVERSATIONS.stored.items()
    assert conversation == events[0].task.context_id
    assert exchanges == [{"message": "6 times 7?", "answer": "Forty-two"}]


async def test_a_lesson_is_kept_in_its_durable_object_and_found_by_id():
    env = fake_env()
    app = build_worker_app(env, lambda value: value)

    lessons = app.state.keeping.lessons

    await lessons.keep("lesson-1", LESSON)

    assert json.loads(env.LESSONS.stored["lesson-1"]) == wire(LESSON)
    assert await lessons.find("lesson-1") == LESSON
    assert await lessons.find("gone") is None


FRACTIONS = TopicRef(
    plan_id="plan-1", subject_slug="mathematics", topic_index=1, topic="Fractions"
)


async def test_a_learners_record_is_kept_in_their_durable_object():
    env = fake_env()
    learners = build_worker_app(env, lambda value: value).state.keeping.learners

    await learners.change("device-1", Learnt(topic=FRACTIONS, at=5))

    [mark] = (await learners.load("device-1")).topics
    assert (mark.topic, mark.learnt_at) == ("Fractions", 5)
    assert (await learners.load("device-2")).topics == []


async def test_a_learners_threads_are_kept_in_the_workers_database():
    env = fake_env()
    threads = build_worker_app(env, lambda value: value).state.keeping.threads
    sent = SentThreads.model_validate(
        {
            "threads": [
                {
                    "id": "thread-1",
                    "scope": {"kind": "general", "planId": "plan-1"},
                    "createdAt": 1,
                    "updatedAt": 1,
                    "messages": [
                        {"id": "m1", "type": "user", "content": "Hi", "timestamp": 1}
                    ],
                }
            ]
        }
    ).threads

    await threads.keep("account:u/learner", sent)

    rows = env.DB.connection.execute(
        "SELECT owner_id, thread_id FROM tutor_messages"
    ).fetchall()
    assert [tuple(row) for row in rows] == [("account:u/learner", "thread-1")]


async def test_a_lesson_is_made_once_by_its_own_durable_object():
    env = fake_env()
    making = build_worker_app(env, lambda value: value).state.keeping.making
    target = LessonTarget(
        **FRACTIONS.model_dump(),
        subject="Mathematics",
        total_topics=3,
        country="Nigeria",
        language="English",
    )
    job = Job(learner="device-1", target=target)

    first = await making.start("key-1", job)
    again = await making.start("key-1", job)

    assert (first.status, again.status) == ("making", "making")
    assert env.LESSON_MAKERS.alarms == ["key-1"]
    assert (await making.progress("key-1")).status == "making"
    assert await making.progress("key-2") is None


def test_a_lesson_makers_alarm_runs_with_the_workers_stores_and_model():
    runner = build_lesson_runner(fake_env())

    assert runner.lm is not None
    assert isinstance(runner.lessons, DurableObjectLessonStore)
    assert isinstance(runner.learners, DurableObjectLearnerStore)


async def test_a_view_is_read_from_the_workers_assets():
    env = fake_env()
    app = build_worker_app(env, lambda value: value)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        token = (await http.post("/api/session")).json()["token"]
        response = await http.post(
            "/mcp",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "resources/read",
                "params": {"uri": "ui://graspy/practice"},
            },
        )

    [content] = response.json()["result"]["contents"]
    assert env.ASSETS.fetched == [
        "https://assets.local/views/practice.html",
        "https://assets.local/views/ui-sandbox-sw.js",
    ]
    assert content["text"] == VIEW.replace(
        "<head>", '<head><base href="https://api.example/">'
    )
    assert content["_meta"]["ui"]["csp"] == {
        "resourceDomains": ["https://api.example"],
        "baseUriDomains": ["https://api.example"],
    }
    assert content["_meta"]["graspy/sandbox"] == f"/ui-sandbox/{build_of(WORKER)}/"
