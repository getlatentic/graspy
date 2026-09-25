"""The tutor over A2A, driven by a2a-sdk's own client as the browser drives it."""

import uuid

import httpx
import pytest
from a2a.client import ClientConfig, create_client
from a2a.helpers.proto_helpers import get_data_parts, new_data_part, new_text_part
from a2a.types import Message, Role, SendMessageRequest, TaskState
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lesson_example import SLIDE

from app.agent.a2a import FAILED_TURN, MAX_MESSAGE_CHARS, TOO_LONG, a2a_routes
from app.agent.app_tools import AppCall
from app.agent.cards import (
    PracticeCard,
    PracticeResult,
    PracticeSet,
    Question,
    ResultMeta,
    TextContent,
)
from app.agent.context import LearnerContext
from app.agent.reply import OpenTopic
from app.agent.streaming import AnswerDelta, AnswerRestart, ToolActivity
from app.agent.tutor import TutorReply
from app.caller import Keeping
from app.domains.lesson.lesson import Lesson
from app.factory import create_app
from app.learner.answers import PracticeAnswer
from app.learner.record import Answer, Answered, LessonKept, TopicRef
from app.learner.store import InMemoryLearnerStore
from app.lessons.makers import TaskLessonMaking
from app.lessons.store import InMemoryLessonStore
from app.security.guard import SessionMiddleware
from app.security.session import issue
from app.settings import Settings

BASE = "http://test"
LEAKY = "upstream https://internal.example/v1 rejected key sk-or-v1-abc"


OPEN_FRACTIONS = OpenTopic(subject_slug="mathematics", topic_index=1, topic="Fractions")


SECRET = "a2a-test-secret"
DEVICE = "a2a0device0000000000000000000001"


SESSION = {"Authorization": f"Bearer {issue(SECRET).token}"}


async def never_run(_job, _save):
    raise AssertionError("A tutor turn never makes a lesson")


KEEPING = Keeping(
    learners=InMemoryLearnerStore(),
    lessons=InMemoryLessonStore(),
    making=TaskLessonMaking(never_run),
)


class FakeTutor:
    def __init__(
        self,
        answer: str = "Forty-two",
        error: Exception | None = None,
        follow_ups: list[str] | None = None,
        actions: list | None = None,
        cards: list | None = None,
        happenings: list | None = None,
    ):
        self.answer, self.error, self.calls, self.contexts = answer, error, [], []
        self.answered, self.missed, self.records = [], [], []
        self.follow_ups, self.actions, self.cards = (
            follow_ups or [],
            actions or [],
            cards or [],
        )
        self.happenings = happenings or []

    async def stream(
        self,
        conversation_id: str,
        message: str,
        context: LearnerContext | None = None,
        calls: list[AppCall] | None = None,
        unanswered: list[str] | None = None,
        record: str = "",
    ):
        self.records.append(record)
        self.missed.append(unanswered)
        self.calls.append((conversation_id, message))
        self.contexts.append(context)
        self.answered.append(calls)
        if self.error:
            raise self.error
        for happening in self.happenings:
            yield happening
        yield TutorReply(self.answer, self.follow_ups, self.actions, self.cards)


def settings() -> Settings:
    return Settings(
        public_base_url=BASE, aws_bearer_token_bedrock="bedrock-test", _env_file=None
    )


def agent_app(tutor) -> FastAPI:
    """The tutor behind the session guard, as the app serves it, so a turn's
    session reaches it the way it does in production."""
    app = FastAPI()
    app.routes.extend(a2a_routes(settings(), tutor, KEEPING))
    app.add_middleware(
        SessionMiddleware, prefixes=(settings().a2a_path_prefix,), secret=SECRET
    )
    return app


async def turn(
    app,
    text: str,
    context_id: str | None = None,
    metadata: dict | None = None,
    data: dict | None = None,
    device: str | None = None,
) -> dict:
    token = issue(SECRET, learner=device).token
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url=BASE,
        headers={"Authorization": f"Bearer {token}"},
    )
    client = await create_client(BASE, client_config=ClientConfig(httpx_client=http))
    message = Message(
        message_id=str(uuid.uuid4()),
        role=Role.ROLE_USER,
        parts=[new_text_part(text), *([new_data_part(data)] if data else [])],
    )
    if context_id:
        message.context_id = context_id
    if metadata:
        message.metadata.update(metadata)

    states, answer, context, update_contexts, data, streamed, activities = (
        [],
        "",
        None,
        [],
        [],
        [],
        [],
    )
    async for event in client.send_message(SendMessageRequest(message=message)):
        if event.HasField("task"):
            states.append("task")
            context = event.task.context_id
        elif event.HasField("status_update"):
            status = event.status_update.status
            states.append(TaskState.Name(status.state).removeprefix("TASK_STATE_"))
            update_contexts.append(event.status_update.context_id)
            said = "".join(part.text for part in status.message.parts)
            answer = said or answer
            parts = get_data_parts(status.message.parts)
            activities += [part["activity"] for part in parts if "activity" in part]
            data = [part for part in parts if "activity" not in part] or data
        elif event.HasField("artifact_update"):
            update = event.artifact_update
            states.append("ARTIFACT")
            streamed.append(
                (
                    update.artifact.artifact_id,
                    update.append,
                    "".join(p.text for p in update.artifact.parts),
                )
            )
    return {
        "states": states,
        "answer": answer,
        "context": context,
        "update_contexts": update_contexts,
        "data": data,
        "streamed": streamed,
        "activities": activities,
    }


async def test_a_turn_emits_what_the_browser_reads():
    tutor = FakeTutor()

    result = await turn(agent_app(tutor), "What is 6 times 7?")

    assert result["states"] == ["task", "WORKING", "COMPLETED"]
    assert result["answer"] == "Forty-two"
    assert result["context"]
    assert result["update_contexts"] == [result["context"]] * 2
    assert tutor.calls == [(result["context"], "What is 6 times 7?")]


async def test_the_learners_situation_travels_as_metadata():
    """The app sends where the learner is beside the question, so the words
    the tutor stores and counts are only the learner's own."""
    tutor = FakeTutor()
    learner = {
        "country": "Nigeria",
        "gradeLevel": "JSS 1",
        "subject": "Mathematics",
        "topics": ["A", "B"],
    }

    await turn(agent_app(tutor), "What is a fraction?", metadata={"learner": learner})

    assert tutor.calls[0][1] == "What is a fraction?"
    assert tutor.contexts[0] == LearnerContext(
        country="Nigeria", gradeLevel="JSS 1", subject="Mathematics", topics=["A", "B"]
    )


async def test_a_malformed_situation_is_dropped_and_the_learner_still_answered():
    tutor = FakeTutor()

    result = await turn(
        agent_app(tutor), "hi", metadata={"learner": {"topics": ["x" * 500]}}
    )

    assert result["states"][-1] == "COMPLETED"
    assert tutor.contexts[0] == LearnerContext()


async def test_follow_ups_and_actions_arrive_beside_the_answer():
    tutor = FakeTutor(
        answer="Fractions is open.",
        follow_ups=["What is 1/2?"],
        actions=[OPEN_FRACTIONS],
    )

    result = await turn(agent_app(tutor), "Take me to fractions")

    assert result["answer"] == "Fractions is open."
    assert result["data"] == [
        {
            "followUps": ["What is 1/2?"],
            "actions": [
                {
                    "type": "open_topic",
                    "subjectSlug": "mathematics",
                    "topicIndex": 1,
                    "topic": "Fractions",
                }
            ],
            "cards": [],
        }
    ]


async def test_a_card_arrives_beside_an_action_not_in_place_of_it():
    """One turn may open a topic and set a question; the app needs both."""
    content = PracticeSet(
        instruction="Halve it.",
        questions=[
            Question(
                question="Half of 8?",
                options=["4", "2"],
                answer_index=0,
                correct_feedback="8 ÷ 2 = 4.",
                incorrect_feedback="Halve it.",
                hint="",
            )
        ],
    )
    card = PracticeCard(
        tool_input={"question": "Half of 8?"},
        tool_result=PracticeResult(
            content=[TextContent(text="Half of 8?")],
            structured_content=content,
            meta=ResultMeta(view_uuid="v1"),
        ),
    )
    tutor = FakeTutor(actions=[OPEN_FRACTIONS], cards=[card])

    result = await turn(agent_app(tutor), "Open fractions and test me")

    [data] = result["data"]
    assert [action["type"] for action in data["actions"]] == ["open_topic"]
    # A tool result with UI, as MCP Apps shapes one.
    assert data["cards"] == [
        {
            "resourceUri": "ui://graspy/practice",
            "toolName": "give_practice",
            "toolInput": {"question": "Half of 8?"},
            "toolResult": {
                "content": [{"type": "text", "text": "Half of 8?"}],
                "structuredContent": {
                    "instruction": "Halve it.",
                    "questions": [
                        {
                            "question": "Half of 8?",
                            "options": ["4", "2"],
                            "answerIndex": 0,
                            "correctFeedback": "8 ÷ 2 = 4.",
                            "incorrectFeedback": "Halve it.",
                            "hint": "",
                        }
                    ],
                },
                "_meta": {"viewUUID": "v1", "where": None},
            },
        }
    ]


async def test_one_conversation_keeps_one_id_across_turns():
    tutor = FakeTutor()
    app = agent_app(tutor)

    first = await turn(app, "first")
    await turn(app, "second", context_id=first["context"])

    assert [conversation for conversation, _ in tutor.calls] == [
        first["context"],
        first["context"],
    ]


async def test_an_overlong_message_is_refused_before_it_reaches_the_model():
    tutor = FakeTutor()

    result = await turn(agent_app(tutor), "x" * (MAX_MESSAGE_CHARS + 1))

    assert result["states"][-1] == "REJECTED"
    assert result["answer"] == TOO_LONG
    assert tutor.calls == []


async def test_a_message_at_the_limit_is_accepted():
    result = await turn(agent_app(FakeTutor()), "x" * MAX_MESSAGE_CHARS)

    assert result["states"][-1] == "COMPLETED"


async def test_a_failed_turn_tells_the_learner_plainly(caplog):
    result = await turn(agent_app(FakeTutor(error=RuntimeError(LEAKY))), "hello")

    assert result["states"][-1] == "FAILED"
    assert result["answer"] == FAILED_TURN
    assert "Tutor turn failed" in caplog.messages
    assert LEAKY in caplog.text, "the detail belongs in the log"


@pytest.mark.parametrize(
    "path", ["/.well-known/agent-card.json", "/a2a/.well-known/agent-card.json"]
)
def test_the_card_is_found_at_the_root_and_under_the_prefix(path):
    """Well-known URIs are not path-scoped (RFC 8615), so clients look at the
    origin root; the prefixed copy serves clients that do not."""
    card = TestClient(agent_app(FakeTutor())).get(path, headers=SESSION).json()

    assert card["supportedInterfaces"][0]["url"] == f"{BASE}/a2a"


def test_a_client_on_the_earlier_protocol_is_still_answered():
    """A2A 0.3 names its methods and fields differently; agents built on it
    are still common."""
    tutor = FakeTutor()
    request = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "message/send",
        "params": {
            "message": {
                "kind": "message",
                "messageId": "m1",
                "role": "user",
                "parts": [{"kind": "text", "text": "hi"}],
            }
        },
    }

    result = (
        TestClient(agent_app(tutor))
        .post("/a2a", json=request, headers=SESSION)
        .json()["result"]
    )

    assert result["status"]["state"] == "completed"
    assert result["status"]["message"]["parts"] == [
        {"kind": "text", "text": "Forty-two"},
        {"kind": "data", "data": {"followUps": [], "actions": [], "cards": []}},
    ]
    assert tutor.calls == [(result["contextId"], "hi")]


def test_the_agent_endpoint_requires_a_session_in_the_real_app():
    app = create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test", session_secret="s", _env_file=None
        )
    )

    assert TestClient(app).post("/a2a", json={}).status_code == 401


async def test_the_answer_streams_as_one_artifact_after_the_tools_are_named():
    tutor = FakeTutor(
        answer="Forty-two, as 6 times 7.",
        happenings=[
            ToolActivity("calculate"),
            AnswerDelta("Forty-two"),
            AnswerDelta(", as 6 times 7."),
        ],
    )

    result = await turn(agent_app(tutor), "What is 6 times 7?")

    assert result["states"] == [
        "task",
        "WORKING",
        "WORKING",
        "ARTIFACT",
        "ARTIFACT",
        "COMPLETED",
    ]
    assert result["streamed"] == [
        ("answer", False, "Forty-two"),
        ("answer", True, ", as 6 times 7."),
    ]
    assert result["answer"] == "Forty-two, as 6 times 7."


async def test_an_answer_written_again_replaces_what_streamed():
    """A2A replaces an artifact sent without append: the app withdraws the
    runaway it was shown."""
    tutor = FakeTutor(
        answer="Place value is where a digit stands.",
        happenings=[
            AnswerDelta("| Example (----"),
            AnswerRestart(),
            AnswerDelta("Place value is where a digit stands."),
        ],
    )

    result = await turn(agent_app(tutor), "Explain place value")

    assert result["streamed"] == [
        ("answer", False, "| Example (----"),
        ("answer", False, ""),
        ("answer", True, "Place value is where a digit stands."),
    ]
    assert result["answer"] == "Place value is where a digit stands."


async def test_a_tool_is_named_as_data_the_app_can_translate():
    tutor = FakeTutor(happenings=[ToolActivity("add_topic")])

    result = await turn(agent_app(tutor), "Add fractions")

    assert result["activities"] == ["add_topic"]
    assert result["data"] == [{"followUps": [], "actions": [], "cards": []}]


ANSWER = {
    "question": "What is 3/8 as a decimal?",
    "options": ["0.375", "0.38", "0.35"],
    "answerIndex": 0,
    "chosenIndex": 2,
}
ANSWER_CALL = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {"name": "answer_practice", "arguments": ANSWER},
}


async def test_a_cards_tools_call_reaches_the_tutor_beside_the_learners_words():
    tutor = FakeTutor()

    await turn(agent_app(tutor), "Explain the answer", data={"appCalls": [ANSWER_CALL]})

    assert tutor.calls[0][1] == "Explain the answer"
    [[answered]] = tutor.answered
    assert answered.name == "answer_practice"
    assert answered.arguments == PracticeAnswer(
        question="What is 3/8 as a decimal?",
        options=["0.375", "0.38", "0.35"],
        answer_index=0,
        chosen_index=2,
    )


async def test_a_malformed_call_costs_the_call_not_the_turn():
    tutor = FakeTutor()
    bad = {
        **ANSWER_CALL,
        "params": {
            "name": "answer_practice",
            "arguments": {**ANSWER, "chosenIndex": 9},
        },
    }

    result = await turn(agent_app(tutor), "Explain", data={"appCalls": [bad]})

    assert result["states"][-1] == "COMPLETED"
    assert tutor.answered == [[]]


FRACTIONS = TopicRef(
    plan_id="plan-1", subject_slug="mathematics", topic_index=1, topic="Fractions"
)
IN_FRACTIONS = {
    "learner": {
        "planId": "plan-1",
        "subject": "Mathematics",
        "subjectSlug": "mathematics",
        "topic": "Fractions",
    }
}


async def test_the_lesson_on_the_learners_record_brings_its_outline_to_the_tutor():
    """The app names the topic; the server finds the lesson it kept there."""
    await KEEPING.lessons.keep(
        "lesson-1",
        Lesson(
            title="Fractions - JSS 1",
            objectives=["Say what the bottom number of a fraction counts"],
            key_points=["The bottom number is the sharer."],
            slides=[
                SLIDE.model_copy(update={"title": "Parts of a whole"}),
                SLIDE.model_copy(update={"title": "The sharer"}),
            ],
        ),
    )
    await KEEPING.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )
    tutor = FakeTutor()

    await turn(
        agent_app(tutor),
        "What do we call the bottom number?",
        metadata=IN_FRACTIONS,
        device=DEVICE,
    )

    lesson = tutor.contexts[0].lesson
    assert lesson.objectives == ["Say what the bottom number of a fraction counts"]
    assert "- Say what the bottom number of a fraction counts" in lesson.describe()
    assert lesson.key_points == ["The bottom number is the sharer."]
    assert lesson.slides == ["Parts of a whole", "The sharer"]


async def test_a_lesson_the_app_sends_is_not_taken_for_one_the_learner_has():
    tutor = FakeTutor()
    sent = {
        "learner": {
            **IN_FRACTIONS["learner"],
            "lesson": {"title": "Made up", "slides": ["Anything"]},
        }
    }

    result = await turn(agent_app(tutor), "Hi", metadata=sent)

    assert result["states"][-1] == "COMPLETED"
    assert tutor.contexts[0].lesson is None


async def test_the_tutor_reads_what_the_learner_got_wrong_in_the_subject():
    device = "a2a0device0000000000000000000002"
    await KEEPING.learners.change(
        device,
        Answered(
            answer=Answer(
                plan_id="plan-1",
                subject_slug="mathematics",
                topic="Fractions",
                source="practice",
                question="What is 3/8 as a decimal?",
                chosen="0.38",
                right="0.375",
                correct=False,
                at=1,
            )
        ),
    )
    tutor = FakeTutor()

    await turn(agent_app(tutor), "Help", metadata=IN_FRACTIONS, device=device)

    assert "What is 3/8 as a decimal? (Fractions): chose '0.38'" in tutor.records[0]


async def test_a_session_without_a_device_is_answered_without_a_record():
    tutor = FakeTutor()

    result = await turn(agent_app(tutor), "Help", metadata=IN_FRACTIONS)

    assert result["states"][-1] == "COMPLETED"
    assert tutor.records[0].startswith("Nothing yet")


async def test_messages_that_got_no_answer_reach_the_tutor_with_the_next():
    """A turn that failed left its question on the learner's screen only."""
    tutor = FakeTutor()

    await turn(
        agent_app(tutor),
        "continue",
        data={
            "unanswered": [
                "the oldest, past the three kept",
                "What is a limit?",
                "Make me a study plan\n for   real analysis",
                7,
                "",
                "and  make it weekly",
            ]
        },
    )

    assert tutor.missed == [
        [
            "What is a limit?",
            "Make me a study plan for real analysis",
            "and make it weekly",
        ]
    ]


async def test_a_turn_with_nothing_unanswered_says_so():
    tutor = FakeTutor()

    await turn(agent_app(tutor), "hello", data={"unanswered": "not a list"})

    assert tutor.missed == [[]]
