"""Smoke tests against a running server and the real model, which spend real
tokens and so are excluded from the default run. Start a server, then:

    uv run pytest -m integration                          # uvicorn, port 8081
    GRASPY_BASE_URL=http://127.0.0.1:8799 uv run pytest -m integration   # pywrangler dev
    GRASPY_BASE_URL=https://graspy-api.tosinamuda.com uv run pytest -m integration

Model output varies, so these check the shape of each answer, not its words.
"""

import asyncio
import json
import os
import uuid

import httpx
import pytest
from a2a.client import ClientConfig, create_client
from a2a.helpers.proto_helpers import new_text_part
from a2a.types import Message, Role, SendMessageRequest, TaskState

pytestmark = pytest.mark.integration

BASE_URL = os.environ.get("GRASPY_BASE_URL", "http://localhost:8081")
TARGET = {
    "planId": "live",
    "subjectSlug": "mathematics",
    "subject": "Mathematics",
    "topicIndex": 0,
    "topic": "Fractions",
    "totalTopics": 1,
    "country": "Nigeria",
    "gradeLevel": "JSS 1",
}


@pytest.fixture
async def http():
    async with httpx.AsyncClient(
        base_url=BASE_URL, timeout=httpx.Timeout(30.0, read=600.0)
    ) as client:
        client.headers["Authorization"] = (
            f"Bearer {(await client.post('/api/session')).json()['token']}"
        )
        yield client


async def stream(http: httpx.AsyncClient, path: str, params: dict) -> list[dict]:
    events = []
    async with http.stream("GET", path, params=params) as response:
        assert response.status_code == 200
        async for line in response.aiter_lines():
            if line.startswith("data: {"):
                events.append(json.loads(line[6:]))
    assert "error" not in [event["type"] for event in events], events
    return events


async def test_the_server_answers(http):
    response = await http.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_subjects_arrive_for_the_learners_class(http):
    events = await stream(
        http,
        "/api/subjects/generate-stream",
        {
            "country": "Nigeria",
            "language": "English",
            "gradeLevel": "JSS 1 (Junior Secondary School), Nigeria",
        },
    )

    subjects = next(event for event in events if event["type"] == "subjects")[
        "subjects"
    ]
    assert subjects and all(
        {"id", "label", "recommended"} <= set(subject) for subject in subjects
    )


async def test_topics_arrive_under_the_chosen_subjects(http):
    events = await stream(
        http,
        "/api/curriculum/generate-stream",
        {
            "country": "Nigeria",
            "language": "English",
            "gradeLevel": "JSS 1",
            "subject": ["Mathematics", "Basic Science"],
        },
    )

    result = events[-1]
    assert [subject["slug"] for subject in result["subjects"]] == [
        "mathematics",
        "basic-science",
    ]
    assert all(result["topics"].get(slug) for slug in ("mathematics", "basic-science"))


async def lesson_tool(http: httpx.AsyncClient, name: str, target: dict) -> dict:
    response = await http.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": {"target": target}},
        },
    )
    return response.json()["result"]["structuredContent"]


@pytest.mark.parametrize("language", ["English", "Yoruba"])
async def test_a_lesson_is_made_whole(http, language):
    target = {**TARGET, "language": language}
    view = await lesson_tool(http, "give_lesson", target)
    for _ in range(120):
        if view["status"] != "making":
            break
        await asyncio.sleep(5)
        view = await lesson_tool(http, "lesson_progress", target)

    assert (view["status"], view["whole"]) == ("ready", True)
    assert view["lesson"]["slides"]
    assert view["lesson"]["practice"]["question"]
    assert view["lesson"]["objectives"]


async def turn(
    http: httpx.AsyncClient, text: str, context_id: str | None = None
) -> tuple[str, str]:
    client = await create_client(
        BASE_URL, client_config=ClientConfig(httpx_client=http)
    )
    message = Message(
        message_id=str(uuid.uuid4()), role=Role.ROLE_USER, parts=[new_text_part(text)]
    )
    if context_id:
        message.context_id = context_id
    answer, state = "", None
    async for event in client.send_message(SendMessageRequest(message=message)):
        if event.HasField("task"):
            context_id = event.task.context_id
        elif event.HasField("status_update"):
            state = event.status_update.status.state
            answer = (
                "".join(part.text for part in event.status_update.status.message.parts)
                or answer
            )
    assert state == TaskState.TASK_STATE_COMPLETED, answer
    return context_id, answer


async def test_the_tutor_answers_and_remembers_the_conversation(http):
    context_id, first = await turn(
        http, "What is 12 times 7? Answer with the number only."
    )
    _, second = await turn(
        http, "Divide your last answer by 4. Answer with the number only.", context_id
    )

    assert "84" in first
    assert "21" in second
