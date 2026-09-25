"""The assembled app, driven as a browser or a Worker request would."""

import asyncio
import json

import httpx
import pytest
from dspy.utils.dummies import DummyLM
from fastapi.testclient import TestClient
from stand_in import stand_in

from app.factory import create_app
from app.settings import Settings

ORIGIN = "https://graspy.getlatentic.com"
PREVIEW = "https://a1b2c3d4.graspy.pages.dev"


def settings(**overrides) -> Settings:
    values = {
        "aws_bearer_token_bedrock": "bedrock-test",
        "session_secret": "s",
        "cors_origins": f"{ORIGIN},https://*.graspy.pages.dev",
        "_env_file": None,
        **overrides,
    }
    return Settings(**values)


@pytest.fixture
def client():
    return TestClient(create_app(settings()))


@pytest.mark.parametrize("origin", [ORIGIN, PREVIEW], ids=["listed", "preview"])
def test_a_preflight_from_an_allowed_origin_may_send_credentials_and_headers(
    client, origin
):
    response = client.options(
        "/a2a",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type, x-a2a-extensions",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["access-control-allow-methods"] == "GET, POST, OPTIONS"
    assert (
        response.headers["access-control-allow-headers"]
        == "authorization, content-type, x-a2a-extensions"
    )


@pytest.mark.parametrize(
    ("origin", "method", "refused"),
    [("https://evil.example", "POST", "origin"), (ORIGIN, "DELETE", "method")],
    ids=["other-origin", "other-method"],
)
def test_a_preflight_outside_the_policy_is_refused(client, origin, method, refused):
    response = client.options(
        "/a2a", headers={"Origin": origin, "Access-Control-Request-Method": method}
    )

    assert response.status_code == 400
    assert response.text == f"Disallowed CORS {refused}"


def test_a_wildcard_origin_is_refused_at_startup():
    with pytest.raises(ValueError) as refused:
        create_app(settings(cors_origins="*"))

    assert str(refused.value) == (
        'CORS_ORIGINS cannot be "*": the A2A client sends credentialed '
        "requests, which require an explicit origin allowlist."
    )


DOCS = ["/api/docs", "/api/redoc", "/api/openapi.json"]


@pytest.mark.parametrize("path", DOCS)
def test_development_serves_the_interactive_docs(client, path):
    assert client.get(path).status_code == 200


def test_the_docs_serve_no_oauth_redirect_page(client):
    """The API has no OAuth flow for such a page to complete."""
    assert client.get("/docs/oauth2-redirect").status_code == 404


async def test_a_request_is_answered_by_the_apps_own_model(monkeypatch):
    """No test elsewhere reaches the app's model: each supplies its own."""
    # Answered in the default adapter's format: the app's model runs without a
    # test's adapter in context, as it does in production.
    own_model = DummyLM([{"reasoning": "r", "topics": {"mathematics": ["Fractions"]}}])
    monkeypatch.setattr("app.factory.build_lm", lambda _settings: own_model)
    app = create_app(settings())
    query = {"country": "Nigeria", "language": "English", "subject": "Mathematics"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        token = (await http.post("/api/session")).json()["token"]
        response = await http.get(
            "/api/curriculum/generate-stream",
            params=query,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert _stream_events(response)[-1]["topics"] == {"mathematics": ["Fractions"]}
    assert len(own_model.history) == 1


@pytest.mark.parametrize("path", [*DOCS, "/docs/oauth2-redirect"])
def test_production_serves_no_docs(path):
    client = TestClient(create_app(settings(app_env="production")))

    assert client.get(path).status_code == 404


async def _with_model(app, answers, request):
    """Sends one request through the app while DummyLM answers the model.

    httpx calls the app in this task, so the DSPy context reaches the handler;
    TestClient would run it on another thread, beyond the context.
    """
    _, context = stand_in(answers)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        token = (await http.post("/api/session")).json()["token"]
        with context:
            return await request(http, {"Authorization": f"Bearer {token}"})


def _stream_events(response: httpx.Response) -> list[dict]:
    return [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: {")
    ]


async def test_the_subject_stream_reaches_the_subject_service():
    answers = [
        {
            "reasoning": "r",
            "subjects": [
                {"id": "mathematics", "label": "Mathematics", "recommended": True}
            ],
        },
    ]
    query = {"country": "Nigeria", "language": "English", "gradeLevel": "Grade 7"}

    response = await _with_model(
        create_app(settings()),
        answers,
        lambda http, auth: http.get(
            "/api/subjects/generate-stream", params=query, headers=auth
        ),
    )

    events = _stream_events(response)
    assert events[-1]["type"] == "subjects"
    assert [subject["id"] for subject in events[-1]["subjects"]] == ["mathematics"]


async def test_the_curriculum_stream_reaches_the_curriculum_service():
    answers = [{"reasoning": "r", "topics": {"mathematics": ["Fractions"]}}]
    query = {"country": "Nigeria", "language": "English", "subject": "Mathematics"}

    response = await _with_model(
        create_app(settings()),
        answers,
        lambda http, auth: http.get(
            "/api/curriculum/generate-stream", params=query, headers=auth
        ),
    )

    assert _stream_events(response)[-1] == {
        "type": "result",
        "subjects": [{"name": "Mathematics", "slug": "mathematics"}],
        "topics": {"mathematics": ["Fractions"]},
    }


DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9"
TARGET = {
    "planId": "plan-1",
    "subjectSlug": "mathematics",
    "subject": "Mathematics",
    "topicIndex": 0,
    "topic": "Algebra",
    "totalTopics": 3,
    "country": "Nigeria",
    "language": "English",
}


def _lesson_answers() -> list[dict]:
    # Each piece of learner text is its own plain-text field, as the model writes it.
    check = {
        "options": "- 1\n- 2",
        "answer_index": 0,
        "correct_feedback": "C",
        "incorrect_feedback": "I",
    }
    slide = {
        "reasoning": "r",
        "title": "Slide",
        "body_md": "Body",
        "question": "P",
        **check,
    }
    plan = {
        "learningObjectives": ["a", "b", "c"],
        "keyPoints": ["k"],
        "slideSpecs": [
            {"slideType": "concept_introduction", "title": f"S{i}", "keyConcept": "K"}
            for i in range(3)
        ],
    }
    practice = {"reasoning": "r", "question": "Q", **check}
    return [{"reasoning": "r", "plan": plan}, *[slide] * 3, practice]


def _mcp_call(name: str, arguments: dict) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }


async def test_a_lesson_asked_for_goes_on_being_made_and_is_filed_on_the_record():
    """give_lesson answers at once; the lesson is made after the request has
    ended, kept, and filed under the device's topic."""
    app = create_app(settings())
    _, context = stand_in(_lesson_answers())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        session = await http.post("/api/session", json={"deviceId": DEVICE})
        auth = {"Authorization": f"Bearer {session.json()['token']}"}
        with context:
            opened = await http.post(
                "/mcp", json=_mcp_call("give_lesson", {"target": TARGET}), headers=auth
            )
            for _ in range(200):
                progress = await http.post(
                    "/mcp",
                    json=_mcp_call("lesson_progress", {"target": TARGET}),
                    headers=auth,
                )
                view = progress.json()["result"]["structuredContent"]
                if view["status"] != "making":
                    break
                await asyncio.sleep(0.01)
        record = await http.get(
            "/api/learner", params={"planId": "plan-1"}, headers=auth
        )

    assert opened.json()["result"]["structuredContent"]["status"] == "making"
    assert (view["status"], view["whole"]) == ("ready", True)
    assert len(view["lesson"]["slides"]) == 3
    [mark] = record.json()["topics"]
    assert (mark["topic"], mark["topicIndex"]) == ("Algebra", 0)
    kept = await app.state.keeping.lessons.find(mark["lessonId"])
    assert kept.model_dump(by_alias=True) == view["lesson"]
