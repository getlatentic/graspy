"""The lesson as an MCP App, and the learner's record its views write, as
MCP's own client and the learner's app reach them."""

import asyncio
from contextlib import asynccontextmanager

import httpx2
import pytest
from lesson_example import LESSON, SLIDE, wire
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app.domains.lesson.lesson import FinishedLesson
from app.factory import create_app
from app.learner.record import Answer, Answered, LessonKept, TopicRef
from app.learner.store import InMemoryLearnerStore
from app.lessons.makers import TaskLessonMaking
from app.lessons.run import LessonRunner
from app.lessons.store import InMemoryLessonStore
from app.settings import Settings

DEVICE = "d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f"
TARGET = {
    "planId": "plan-1",
    "subjectSlug": "mathematics",
    "subject": "Mathematics",
    "topicIndex": 1,
    "topic": "Fractions",
    "totalTopics": 3,
    "country": "Nigeria",
    "language": "English",
}
FRACTIONS = TopicRef(
    plan_id="plan-1", subject_slug="mathematics", topic_index=1, topic="Fractions"
)
CHECK = {
    "question": "Which is bigger, 1/2 or 1/3?",
    "options": ["1/2", "1/3"],
    "answerIndex": 0,
    "chosenIndex": 1,
    "where": {"planId": "plan-1", "subjectSlug": "mathematics", "topic": "Fractions"},
}


class HeldService:
    """Lessons that arrive only when let go, so a test sees one being made."""

    def __init__(self):
        self.go = asyncio.Event()
        self.requests = []

    async def events(self, request):
        self.requests.append(request)
        yield {"type": "slide", "payload": SLIDE}
        await self.go.wait()
        yield {
            "type": "complete",
            "payload": FinishedLesson(success=True, lesson=LESSON),
        }


@pytest.fixture
def server():
    service = HeldService()
    lessons, learners = InMemoryLessonStore(), InMemoryLearnerStore()
    app = create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test", session_secret="s", _env_file=None
        ),
        lessons=lessons,
        learners=learners,
        making=TaskLessonMaking(LessonRunner(service, lessons, learners)),
    )
    app.state.service = service
    return app


@asynccontextmanager
async def http_to(app, device: str | None = DEVICE):
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=app), base_url="http://test"
    ) as http:
        asked = {"deviceId": device} if device else None
        token = (await http.post("/api/session", json=asked)).json()["token"]
        http.headers["Authorization"] = f"Bearer {token}"
        yield http


@asynccontextmanager
async def connected(app, device: str | None = DEVICE):
    async with http_to(app, device) as http:
        transport = streamable_http_client("http://test/mcp", http_client=http)
        async with Client(transport) as client:
            yield client


async def record_of(app, device: str = DEVICE) -> dict:
    async with http_to(app, device) as http:
        response = await http.get("/api/learner", params={"planId": "plan-1"})
    return response.json()


async def test_opening_a_topic_starts_its_lesson_and_answers_at_once(server):
    async with connected(server) as client:
        opened = await client.call_tool("give_lesson", {"target": TARGET})
        await asyncio.sleep(0)
        joined = await client.call_tool("lesson_progress", {"target": TARGET})

    assert opened.structured_content["status"] == "making"
    assert opened.structured_content["lessonId"] is None
    assert opened.structured_content["target"] == {
        **TARGET,
        "gradeLevel": None,
        "buildsOn": [],
    }
    assert opened.meta["viewUUID"] == joined.meta["viewUUID"]
    assert joined.structured_content["lesson"]["slides"] == [wire(SLIDE)]
    assert joined.content[0].text == "The lesson is being made: 1 slides so far."


async def test_the_lesson_goes_on_after_the_view_stops_asking_and_is_filed(server):
    async with connected(server) as client:
        await client.call_tool("give_lesson", {"target": TARGET})
    server.state.service.go.set()
    for _ in range(50):
        await asyncio.sleep(0)

    async with connected(server) as client:
        reopened = await client.call_tool("give_lesson", {"target": TARGET})

    assert reopened.structured_content["status"] == "ready"
    assert reopened.structured_content["lesson"] == wire(LESSON)
    assert len(server.state.service.requests) == 1
    [mark] = (await record_of(server))["topics"]
    assert mark["lessonId"]
    assert reopened.structured_content["lessonId"] == mark["lessonId"]


async def test_a_lesson_on_the_record_opens_without_being_made(server):
    keeping = server.state.keeping
    await keeping.lessons.keep("lesson-1", LESSON)
    await keeping.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )

    async with connected(server) as client:
        opened = await client.call_tool("give_lesson", {"target": TARGET})
        watched = await client.call_tool("lesson_progress", {"target": TARGET})

    assert opened.structured_content["status"] == "ready"
    assert opened.structured_content["whole"] is True
    assert opened.structured_content["lessonId"] == "lesson-1"
    assert watched.structured_content["lessonId"] == "lesson-1"
    assert server.state.service.requests == []


async def test_a_kept_lesson_opens_as_it_was_kept_though_its_key_would_be_moved_now(
    server,
):
    """Answers are checked as a lesson is made: a learner who has started a
    lesson never finds its checks changed under them."""
    wrong_key = SLIDE.assessment.model_copy(
        update={
            "prompt": "Which decimal is equal to 2/5?",
            "options": ["0.2", "0.4", "2.5"],
            "answer_index": 0,
        }
    )
    kept = LESSON.model_copy(
        update={"slides": [SLIDE.model_copy(update={"assessment": wrong_key})]}
    )
    keeping = server.state.keeping
    await keeping.lessons.keep("lesson-1", kept)
    await keeping.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )

    async with connected(server) as client:
        opened = await client.call_tool("give_lesson", {"target": TARGET})

    assert opened.structured_content["lesson"] == wire(kept)
    assert server.state.service.requests == []


async def test_a_lesson_is_aimed_at_what_the_learner_got_wrong(server):
    wrong = Answer(
        plan_id="plan-1",
        subject_slug="mathematics",
        topic="Fractions",
        source="lesson",
        question="Which is bigger, 1/2 or 1/3?",
        chosen="1/3",
        right="1/2",
        correct=False,
        at=1,
    )
    await server.state.keeping.learners.change(DEVICE, Answered(answer=wrong))

    async with connected(server) as client:
        await client.call_tool("give_lesson", {"target": TARGET})
        await asyncio.sleep(0)

    [request] = server.state.service.requests
    assert "Which is bigger, 1/2 or 1/3? (Fractions): chose '1/3'" in (
        request.learner_notes
    )


async def test_watching_a_lesson_never_starts_one(server):
    async with connected(server) as client:
        watched = await client.call_tool("lesson_progress", {"target": TARGET})

    assert watched.structured_content["status"] == "failed"
    assert server.state.service.requests == []


async def test_a_check_and_a_practice_answer_are_filed_where_they_were_asked(server):
    async with connected(server) as client:
        checked = await client.call_tool("answer_check", CHECK)
        await client.call_tool("answer_practice", {**CHECK, "chosenIndex": 0})

    assert checked.structured_content == {
        "correct": False,
        "answerIndex": 0,
        "chosenIndex": 1,
    }
    answers = (await record_of(server))["answers"]
    assert [(a["source"], a["correct"], a["chosen"]) for a in answers] == [
        ("lesson", False, "1/3"),
        ("practice", True, "1/2"),
    ]
    assert {a["topic"] for a in answers} == {"Fractions"}


async def test_finishing_a_lesson_marks_the_topic(server):
    topic = {k: TARGET[k] for k in ("planId", "subjectSlug", "topicIndex", "topic")}

    async with connected(server) as client:
        await client.call_tool("finish_lesson", topic)

    [mark] = (await record_of(server))["topics"]
    assert mark["topic"] == "Fractions"
    assert mark["learntAt"] > 0


async def test_a_topic_too_long_to_be_one_is_refused(server):
    async with connected(server) as client:
        refused = await client.call_tool(
            "give_lesson", {"target": {**TARGET, "topic": "x" * 301}}
        )

    assert refused.is_error
    assert server.state.service.requests == []


async def test_answers_without_a_device_are_marked_and_kept_nowhere(server):
    async with connected(server, device=None) as client:
        checked = await client.call_tool("answer_check", CHECK)

    assert checked.structured_content["correct"] is False
    assert server.state.keeping.learners._stored == {}


async def test_the_record_needs_a_session_that_names_a_device(server):
    async with http_to(server, device=None) as http:
        response = await http.get("/api/learner", params={"planId": "plan-1"})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "no_device"


async def test_the_devices_records_are_brought_across_once(server):
    device_records = {
        "topics": [
            {
                "planId": "plan-1",
                "subjectSlug": "mathematics",
                "topicIndex": 0,
                "topic": "Place value",
                "learntAt": 7,
            }
        ],
        "answers": [
            {
                "planId": "plan-1",
                "subjectSlug": "mathematics",
                "source": "practice",
                "question": "2 + 2?",
                "chosen": "4",
                "right": "4",
                "correct": True,
                "at": 3,
            }
        ],
        "lessons": [
            {
                "topic": {
                    "planId": "plan-1",
                    "subjectSlug": "mathematics",
                    "topicIndex": 1,
                    "topic": "Fractions",
                },
                "lesson": wire(LESSON),
            }
        ],
    }

    async with http_to(server) as http:
        first = await http.post("/api/learner/import", json=device_records)
        again = await http.post("/api/learner/import", json=device_records)

    record = await record_of(server)
    assert (first.json(), again.json()) == ({"imported": True}, {"imported": False})
    marks = {mark["topic"]: mark for mark in record["topics"]}
    assert marks["Place value"]["learntAt"] == 7
    lesson_id = marks["Fractions"]["lessonId"]
    assert await server.state.keeping.lessons.find(lesson_id) == LESSON
    assert len(record["answers"]) == 1


def kept_on_device(topic: str, topic_index: int, lesson) -> dict:
    return {
        "topic": {
            "planId": "plan-1",
            "subjectSlug": "mathematics",
            "topicIndex": topic_index,
            "topic": topic,
        },
        "lesson": lesson,
    }


# A lesson as the first builds kept it on the device: checks without
# feedback, an empty practice question for "none", no objectives, and the
# device's session beside it.
EARLIER_LESSON = {
    "title": "Fractions",
    "content": "",
    "keyPoints": ["Halves"],
    "slides": [
        {
            "slideType": "concept_introduction",
            "title": "Parts of a whole",
            "bodyMd": "Body.",
            "assessment": {
                "type": "choice",
                "prompt": "What is 2 + 2?",
                "options": ["4", "5"],
                "answerIndex": 0,
            },
        },
        {"title": "A slide that never arrived whole"},
    ],
    "examples": [],
    "practice": {
        "question": "",
        "options": [],
        "answerIndex": -1,
        "correctFeedback": "",
        "incorrectFeedback": "",
    },
    "progress": {"current": 0, "total": 1},
    "session": {"id": "session-Fractions", "phase": "explanation"},
}


async def test_a_devices_lesson_from_an_earlier_build_is_brought_across(server):
    async with http_to(server) as http:
        imported = await http.post(
            "/api/learner/import",
            json={"lessons": [kept_on_device("Fractions", 1, EARLIER_LESSON)]},
        )

    assert imported.json() == {"imported": True}
    [mark] = (await record_of(server))["topics"]
    kept = await server.state.keeping.lessons.find(mark["lessonId"])
    assert [slide.title for slide in kept.slides] == ["Parts of a whole"]
    assert kept.slides[0].assessment.correct_feedback == ""
    assert (kept.practice, kept.objectives, kept.key_points) == (None, [], ["Halves"])


async def test_a_devices_malformed_lesson_is_left_out_of_the_import(server, caplog):
    malformed = {"title": "Decimals", "slides": [{"title": "No body"}]}
    lessons = [
        kept_on_device("Decimals", 2, malformed),
        kept_on_device("Fractions", 1, wire(LESSON)),
    ]

    async with http_to(server) as http:
        imported = await http.post("/api/learner/import", json={"lessons": lessons})

    assert imported.json() == {"imported": True}
    [mark] = (await record_of(server))["topics"]
    assert mark["topic"] == "Fractions"
    assert await server.state.keeping.lessons.find(mark["lessonId"]) == LESSON
    assert "A lesson the device kept is malformed and is left out" in caplog.messages


async def test_the_app_keeps_the_record_in_step_with_its_plan(server):
    await server.state.keeping.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )

    async with http_to(server) as http:
        carried = await http.post(
            "/api/learner/plan",
            json={
                "kind": "subjects_carried",
                "fromPlan": "plan-1",
                "toPlan": "plan-2",
                "subjectSlugs": ["mathematics"],
            },
        )
        # A lesson or an answer reaches the record through the views' tools.
        refused = await http.post(
            "/api/learner/plan",
            json={"kind": "learnt", "topic": TARGET, "at": 1},
        )
        moved = await http.get("/api/learner", params={"planId": "plan-2"})

    assert carried.status_code == 200
    assert refused.status_code == 422
    [mark] = moved.json()["topics"]
    assert (mark["topic"], mark["lessonId"]) == ("Fractions", "lesson-1")


async def test_an_import_bigger_than_any_lesson_is_refused(server):
    huge = {"title": "x", "slides": [{"bodyMd": "y" * 200_001}]}
    records = {
        "lessons": [
            {
                "topic": {
                    "planId": "plan-1",
                    "subjectSlug": "mathematics",
                    "topicIndex": 1,
                    "topic": "Fractions",
                },
                "lesson": huge,
            }
        ]
    }

    async with http_to(server) as http:
        refused = await http.post("/api/learner/import", json=records)

    assert refused.status_code == 422
    assert server.state.keeping.lessons._lessons == {}


async def test_the_fingerprint_is_kept_on_the_record_as_a_hint_only(server):
    fingerprint = "0a1b2c3d4e5f60718293a4b5c6d7e8f9"
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=server), base_url="http://test"
    ) as http:
        minted = await http.post(
            "/api/session", json={"deviceId": DEVICE, "fingerprint": fingerprint}
        )
        refused = await http.post(
            "/api/session", json={"deviceId": DEVICE, "fingerprint": "not hex!"}
        )

    assert minted.status_code == 200
    assert refused.status_code == 422
    record = await server.state.keeping.learners.load(DEVICE)
    assert record.fingerprint == fingerprint
    # The record the app reads does not carry it back.
    assert "fingerprint" not in await record_of(server)


async def test_the_goal_of_a_path_is_taught_with_the_steps_skipped_recapped(server):
    goal = {**TARGET, "buildsOn": ["Sequences", "Limits of sequences"]}

    async with connected(server) as client:
        opened = await client.call_tool("give_lesson", {"target": goal})
        plain = await client.call_tool("lesson_progress", {"target": TARGET})
        await asyncio.sleep(0)

    [request] = server.state.service.requests
    assert "have not studied the topics that lead up to it: Sequences; Limits" in (
        request.learner_notes
    )
    # One lesson on the topic, whatever it builds on.
    assert opened.meta["viewUUID"] == plain.meta["viewUUID"]
