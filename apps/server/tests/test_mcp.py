"""The MCP endpoint, driven by the official SDK's client in its default mode."""

from contextlib import asynccontextmanager

import httpx2
import pytest
from mcp import Client
from mcp.client.extension import advertise
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import MCPError

from app.factory import create_app
from app.mcp.sandbox import build_of
from app.mcp.views import LocalViews
from app.settings import Settings

ORIGIN = "https://graspy-api.example"
VIEW = '<!doctype html><html><head><meta charset="UTF-8" /></head><body></body></html>'
WORKER = "// the views' build's sandbox worker"
QUESTION = {
    "question": "Convert \\(\\frac{13}{40}\\) to a decimal.",
    "working": "13 ÷ 40 = 0.325",
    "options": ["0.325", "0.35", "3.25"],
    "answer_index": 0,
    "correct_feedback": "13 ÷ 40 = 0.325.",
    "incorrect_feedback": "Divide the top by the bottom.",
    "check": "13/40",
}
PRACTICE = {"instruction": "Write it as a decimal.", "questions": [QUESTION]}
PASSAGE = {
    "instruction": "Read, then answer.",
    "title": "Market Day",
    "passage": "Ada sells tomatoes at Oja Oba market in Akure every Saturday. "
    "She loads three baskets onto a bus before dawn and reaches the market by "
    "six, and by noon every basket is empty. Then she counts her money and "
    "takes the bus home to Ijapo.",
    "questions": [
        {
            "question": "How many baskets?",
            "evidence": "three baskets",
            "options": ["Two", "Three"],
            "answer_index": 1,
            "correct_feedback": "Three.",
            "incorrect_feedback": "Look again.",
        }
    ],
}
ANSWER = {
    "question": QUESTION["question"],
    "options": QUESTION["options"],
    "answerIndex": 0,
    "chosenIndex": 2,
}


@pytest.fixture
def app(tmp_path):
    (tmp_path / "views").mkdir()
    (tmp_path / "views" / "practice.html").write_text(VIEW, encoding="utf-8")
    (tmp_path / "views" / "ui-sandbox-sw.js").write_text(WORKER, encoding="utf-8")
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        public_base_url=f"{ORIGIN}/",
        _env_file=None,
    )
    return create_app(settings, views=LocalViews(tmp_path))


@asynccontextmanager
async def http_to(app, authorized: bool = True, device: str | None = None):
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=app), base_url="http://test"
    ) as http:
        if authorized:
            asked = {"deviceId": device} if device else None
            token = (await http.post("/api/session", json=asked)).json()["token"]
            http.headers["Authorization"] = f"Bearer {token}"
        yield http


@asynccontextmanager
async def connected(app, device: str | None = None, plan: dict | None = None):
    async with http_to(app, device=device) as http:
        if plan is not None:
            kept = await http.put("/api/learner/curriculum", json=plan)
            assert kept.status_code == 200
        transport = streamable_http_client("http://test/mcp", http_client=http)
        ui = advertise(
            "io.modelcontextprotocol/ui", {"mimeTypes": ["text/html;profile=mcp-app"]}
        )
        async with Client(transport, extensions=[ui]) as client:
            yield client


async def test_a_client_connects_by_the_handshake_after_its_discover_probe(app):
    async with connected(app) as client:
        assert client.protocol_version == "2025-11-25"
        assert client.server_capabilities.tools is not None
        assert client.server_capabilities.resources is not None


async def test_the_tools_are_listed_with_their_ui_and_who_may_call_them(app):
    async with connected(app) as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}

    assert set(tools) == {
        "give_practice",
        "give_passage",
        "answer_practice",
        "give_lesson",
        "lesson_progress",
        "answer_check",
        "finish_lesson",
        "learner_route",
    }
    # Both apps ask it for the learner; no model does.
    assert tools["learner_route"].meta == {"ui": {"visibility": ["app"]}}
    assert tools["give_practice"].meta == {
        "ui": {"visibility": ["model", "app"], "resourceUri": "ui://graspy/practice"}
    }
    assert tools["give_passage"].meta == {
        "ui": {"visibility": ["model", "app"], "resourceUri": "ui://graspy/passage"}
    }
    # Any of this server's views may call it: it names no one resource.
    assert tools["answer_practice"].meta == {"ui": {"visibility": ["app"]}}
    # A host opens the lesson itself: the model never sees it.
    assert tools["give_lesson"].meta == {
        "ui": {"visibility": ["app"], "resourceUri": "ui://graspy/lesson"}
    }
    # The tutor's own description: what a model reads is the same everywhere.
    assert tools["give_practice"].description.startswith("Give the learner practice")
    schema = tools["give_practice"].input_schema
    assert schema["required"] == ["instruction", "questions"]
    question = schema["$defs"]["PracticeQuestion"]
    assert "answer_index" in question["required"]
    assert question["properties"]["working"]["description"].startswith("The solution")


async def test_give_practice_returns_the_question_for_its_view(app):
    async with connected(app) as client:
        result = await client.call_tool("give_practice", PRACTICE)

    assert not result.is_error
    [question] = result.structured_content["questions"]
    assert result.structured_content["instruction"] == "Write it as a decimal."
    assert question["options"] == QUESTION["options"]
    assert question["answerIndex"] == 0
    assert len(result.meta["viewUUID"]) == 32
    assert "The right answer: 0.325" in result.content[0].text


async def test_give_passage_returns_the_passage_for_its_view(app):
    async with connected(app) as client:
        result = await client.call_tool("give_passage", PASSAGE)

    assert not result.is_error
    assert result.structured_content["title"] == "Market Day"
    assert result.structured_content["questions"][0]["answerIndex"] == 1


async def test_a_question_whose_key_is_wrong_is_a_tool_error_to_correct(app):
    async with connected(app) as client:
        wrong = {**PRACTICE, "questions": [{**QUESTION, "answer_index": 1}]}
        result = await client.call_tool("give_practice", wrong)

    assert result.is_error
    assert "Question 1: check gives 0.325" in result.content[0].text


async def test_arguments_of_the_wrong_shape_are_a_tool_error(app):
    async with connected(app) as client:
        result = await client.call_tool("answer_practice", {"question": "?"})

    assert result.is_error
    assert result.content[0].text.startswith("Invalid arguments for answer_practice")


async def test_answer_practice_marks_the_choice(app):
    async with connected(app) as client:
        result = await client.call_tool("answer_practice", ANSWER)

    assert result.structured_content == {
        "correct": False,
        "answerIndex": 0,
        "chosenIndex": 2,
    }


def a_plan(**details) -> dict:
    return {"planId": "plan-1", "updatedAt": 1, "subjects": [], **details}


async def route(app, arguments: dict, plan: dict | None = None) -> bool:
    async with connected(app, device="device-route-01", plan=plan) as client:
        result = await client.call_tool("learner_route", arguments)
    assert not result.is_error
    return result.structured_content["voiceOnly"]


async def test_a_nursery_class_learns_by_voice_alone_and_a_primary_one_by_slides(app):
    assert await route(app, {"system": "NG", "level": "nursery-2"}) is True
    assert await route(app, {"system": "NG", "level": "primary-2"}) is False


async def test_a_plan_with_no_class_is_placed_by_the_level_the_server_reads(app):
    nursery = {"gradeLevel": "Kindergarten (Early childhood), Nigeria, age 5"}
    primary = {"gradeLevel": "Primary 1 (Primary), Nigeria, age 6"}

    assert await route(app, nursery) is True
    assert await route(app, primary) is False


async def test_a_class_not_named_is_the_one_of_the_plan_the_devices_share(app):
    shared = a_plan(gradeLevel="Nursery 1 (Early childhood), Nigeria, age 3")

    assert await route(app, {}, plan=shared) is True
    assert await route(app, {"gradeLevel": "middle school"}, plan=shared) is True


async def test_a_class_the_catalogue_cannot_place_learns_by_slides_and_voice(app):
    assert await route(app, {}) is False
    assert await route(app, {"gradeLevel": "Undergraduate student"}) is False


async def test_an_unknown_tool_is_a_protocol_error(app):
    async with connected(app) as client:
        with pytest.raises(MCPError, match="Unknown tool"):
            await client.call_tool("delete_everything", {})


async def test_the_view_is_read_with_the_origin_and_sandbox_it_loads_in(app):
    async with connected(app) as client:
        listed = (await client.list_resources()).resources
        [content] = (await client.read_resource("ui://graspy/practice")).contents

    assert {(resource.uri, resource.title) for resource in listed} == {
        ("ui://graspy/practice", "Practice"),
        ("ui://graspy/passage", "Reading"),
        ("ui://graspy/lesson", "Lesson"),
    }
    assert {resource.mime_type for resource in listed} == {content.mime_type}
    assert content.mime_type == "text/html;profile=mcp-app"
    assert content.text.startswith(
        f'<!doctype html><html><head><base href="{ORIGIN}/"><meta charset'
    )
    assert content.meta == {
        "ui": {
            "prefersBorder": False,
            "csp": {"resourceDomains": [ORIGIN], "baseUriDomains": [ORIGIN]},
        },
        "graspy/sandbox": f"/ui-sandbox/{build_of(WORKER)}/",
    }


async def test_an_unknown_resource_is_not_found(app):
    async with connected(app) as client:
        with pytest.raises(MCPError) as raised:
            await client.read_resource("ui://graspy/nothing")

    assert raised.value.error.code == -32002


async def test_a_view_not_built_says_how_to_build_it(tmp_path):
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test", session_secret="s", _env_file=None
    )
    app = create_app(settings, views=LocalViews(tmp_path))

    async with connected(app) as client:
        with pytest.raises(MCPError, match="npm run build` in apps/server/ui"):
            await client.read_resource("ui://graspy/practice")


async def post(app, body, **headers):
    async with http_to(app) as http:
        return await http.post("/mcp", json=body, headers=headers)


async def test_a_notification_is_accepted_without_a_body(app):
    response = await post(
        app, {"jsonrpc": "2.0", "method": "notifications/initialized"}
    )

    assert response.status_code == 202
    assert response.content == b""


async def test_the_stateless_eras_probe_is_told_the_versions_spoken_here(app):
    response = await post(
        app,
        {"jsonrpc": "2.0", "id": 7, "method": "server/discover"},
        **{"MCP-Protocol-Version": "2026-07-28"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "jsonrpc": "2.0",
        "id": 7,
        "error": {
            "code": -32022,
            "message": "Unsupported protocol version: 2026-07-28",
            "data": {
                "supported": ["2025-11-25", "2025-06-18", "2025-03-26"],
                "requested": "2026-07-28",
            },
        },
    }


async def test_a_method_this_server_lacks_is_not_found(app):
    response = await post(app, {"jsonrpc": "2.0", "id": 7, "method": "prompts/list"})

    assert response.json()["error"]["code"] == -32601


async def test_a_batch_is_refused(app):
    response = await post(app, [{"jsonrpc": "2.0", "id": 1, "method": "ping"}])

    assert response.status_code == 400
    assert response.json()["error"]["code"] == -32600


async def test_a_body_too_large_is_refused_before_it_is_parsed(app):
    async with http_to(app) as http:
        response = await http.post("/mcp", content=b"x" * (64 * 1024 + 1))

    assert response.status_code == 413


async def test_there_is_no_stream_to_open(app):
    async with http_to(app) as http:
        response = await http.get("/mcp")

    assert response.status_code == 405
    assert response.headers["allow"] == "POST"


async def test_the_endpoint_needs_a_session(app):
    async with http_to(app, authorized=False) as http:
        response = await http.post(
            "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}
        )

    assert response.status_code == 401
