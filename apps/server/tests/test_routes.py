"""The endpoints with the services replaced: which guard applies, what each
handler passes down, and what comes back. A model is never called."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import MAX_SHORT_TEXT, MAX_SUBJECTS_PER_REQUEST
from app.factory import create_app
from app.security.session import issue, learner_of, verify
from app.settings import Settings

SECRET = "route-test-secret"
DEVICE = "7f3c9a1b2d4e5f60718293a4b5c6d7e8"


@pytest.fixture
def services():
    async def one_event():
        yield json.dumps({"type": "status", "message": "working"})

    curriculum = MagicMock()
    curriculum.generate_stream = MagicMock(side_effect=lambda **_: one_event())

    subjects = MagicMock()
    subjects.generate_stream = MagicMock(side_effect=lambda **_: one_event())

    path = MagicMock()
    path.plan_path = AsyncMock(
        return_value={
            "subject": "Real analysis",
            "goal": "real analysis",
            "steps": [{"title": "Sequences", "level": "SS 2"}],
        }
    )
    return SimpleNamespace(curriculum=curriculum, subjects=subjects, path=path)


@pytest.fixture
def client(services):
    app = create_app(
        Settings(
            session_secret=SECRET,
            aws_bearer_token_bedrock="bedrock-test",
            app_env="development",
        )
    )
    app.state.curriculum_service = services.curriculum
    app.state.subject_service = services.subjects
    app.state.path_service = services.path
    app.state.session_secret = SECRET
    return TestClient(app)


@pytest.fixture
def auth():
    return {"Authorization": f"Bearer {issue(SECRET).token}"}


def test_health_reports_the_environment(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "environment" in response.json()["details"]


def test_session_issues_a_token_and_says_when_it_expires(client):
    body = client.post("/api/session").json()

    assert body["token"]
    assert body["expiresIn"] > 0
    assert learner_of(verify(body["token"], SECRET)) is None


def test_a_session_for_a_device_names_it(client):
    body = client.post("/api/session", json={"deviceId": DEVICE}).json()

    assert learner_of(verify(body["token"], SECRET)) == DEVICE


@pytest.mark.parametrize("device", ["short", "a" * 65, "has spaces in it", "ü" * 10])
def test_a_session_refuses_a_device_id_it_cannot_file_a_record_under(client, device):
    assert client.post("/api/session", json={"deviceId": device}).status_code == 422


STREAM_ENDPOINTS = [
    (
        "GET",
        "/api/subjects/generate-stream?country=NG&language=English&schoolGrade=JSS1",
    ),
    (
        "GET",
        "/api/curriculum/generate-stream?country=NG&language=English&schoolGrade=JSS1",
    ),
]
PATH_QUERY = "country=Nigeria&language=English&goal=real%20analysis&gradeLevel=JSS%201"
GENERATION_ENDPOINTS = [
    *STREAM_ENDPOINTS,
    ("GET", f"/api/curriculum/path?{PATH_QUERY}"),
]


@pytest.mark.parametrize(("method", "url"), GENERATION_ENDPOINTS)
def test_generation_refuses_an_unauthenticated_request(client, method, url):
    assert client.request(method, url).status_code == 401


@pytest.mark.parametrize(("method", "url"), GENERATION_ENDPOINTS)
def test_generation_accepts_a_session_token(client, auth, method, url):
    assert client.request(method, url, headers=auth).status_code == 200


@pytest.mark.parametrize(("method", "url"), STREAM_ENDPOINTS)
def test_a_stream_disables_proxy_buffering(client, auth, method, url):
    """nginx would otherwise hold the whole plan and deliver it at the end."""
    response = client.request(method, url, headers=auth)

    assert response.headers["x-accel-buffering"] == "no"
    assert response.headers["cache-control"] == "no-cache"


def test_the_curriculum_stream_passes_the_query_through(client, auth, services):
    client.get(
        "/api/curriculum/generate-stream?country=Nigeria&language=Yoruba&schoolGrade=JSS2",
        headers=auth,
    )

    passed = services.curriculum.generate_stream.call_args.kwargs
    assert passed["country"] == "Nigeria"
    assert passed["language"] == "Yoruba"


def test_an_oversized_field_is_refused_before_a_model_is_called(client, auth, services):
    response = client.get(
        f"/api/curriculum/path?{PATH_QUERY}&country={'N' * 20_000}", headers=auth
    )

    assert response.status_code == 422
    services.path.plan_path.assert_not_awaited()


@pytest.mark.parametrize(
    ("path", "service"),
    [
        ("/api/subjects/generate-stream", "subjects"),
        ("/api/curriculum/generate-stream", "curriculum"),
    ],
)
def test_a_stream_describes_a_missing_grade_as_standard(
    client, auth, services, path, service
):
    """Without a default the prompt would describe the grade as "None"."""
    client.get(f"{path}?country=Nigeria&language=English", headers=auth)

    assert (
        getattr(services, service).generate_stream.call_args.kwargs["grade_level"]
        == "Standard"
    )


def test_a_learning_path_is_planned_from_the_learners_grade(client, auth, services):
    response = client.get(f"/api/curriculum/path?{PATH_QUERY}", headers=auth)

    assert response.json() == {
        "subject": "Real analysis",
        "goal": "real analysis",
        "steps": [{"title": "Sequences", "level": "SS 2"}],
    }
    services.path.plan_path.assert_awaited_once_with(
        "Nigeria", "English", "JSS 1", "real analysis"
    )


CURRICULUM = "/api/curriculum/generate-stream"


@pytest.mark.parametrize(
    "params",
    [
        pytest.param(
            {"country": "x" * (MAX_SHORT_TEXT + 1), "language": "English"},
            id="country-too-long",
        ),
        pytest.param(
            {"country": "Nigeria", "language": "x" * (MAX_SHORT_TEXT + 1)},
            id="language-too-long",
        ),
        pytest.param({"country": "", "language": "English"}, id="country-empty"),
        pytest.param({"country": "   ", "language": "English"}, id="country-blank"),
        pytest.param({"country": "Nigeria"}, id="language-missing"),
        pytest.param(
            {
                "country": "Nigeria",
                "language": "English",
                "gradeLevel": "x" * (MAX_SHORT_TEXT + 1),
            },
            id="grade-too-long",
        ),
    ],
)
def test_a_prompt_field_out_of_bounds_is_refused(client, auth, services, params):
    """A prompt field's length is a cost: a megabyte of "country" is a
    megabyte of billed tokens."""
    assert client.get(CURRICULUM, params=params, headers=auth).status_code == 422
    services.curriculum.generate_stream.assert_not_called()


def test_too_many_subjects_are_refused(client, auth):
    query = [("country", "Nigeria"), ("language", "English")]
    query += [("subject", f"subject-{i}") for i in range(MAX_SUBJECTS_PER_REQUEST + 1)]
    assert client.get(CURRICULUM, params=query, headers=auth).status_code == 422


def test_the_session_guard_answers_before_any_bound_is_checked(client):
    """An unauthenticated caller must not be able to probe validation."""
    params = {"country": "x" * (MAX_SHORT_TEXT + 1), "language": "English"}
    assert client.get(CURRICULUM, params=params).status_code == 401


def test_a_refusal_names_the_field_and_reason_without_echoing_the_input(
    client, auth, caplog
):
    """Echoing the rejected value would hand an attacker a reflection point."""
    marker = "z" * (MAX_SHORT_TEXT + 1)

    response = client.get(
        CURRICULUM, params={"country": marker, "language": "English"}, headers=auth
    )

    body = response.json()
    assert marker not in response.text
    assert body["error"] == "Invalid request"
    [problem] = body["detail"]
    assert problem["loc"] == ["query", "country"]
    assert problem["type"] == "string_too_long"
    assert "input" not in problem and "url" not in problem
    assert f"Rejected request to {CURRICULUM}: 1 problem(s)" in caplog.messages
