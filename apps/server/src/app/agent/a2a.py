"""The tutor over A2A: the agent card at /.well-known/agent-card.json (and
again under the prefix), JSON-RPC at the prefix."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from a2a.helpers.proto_helpers import (
    new_data_part,
    new_task_from_user_message,
    new_text_part,
)
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentSkill,
    TaskState,
)
from a2a.utils.errors import UnsupportedOperationError
from google.protobuf.json_format import MessageToDict

from ..caller import Caller, Keeping
from ..learner.notes import notes_for
from ..learner.record import Conversed
from ..settings import Settings
from .app_tools import app_calls
from .context import LearnerContext, with_kept_lesson
from .reply import ReplyData
from .streaming import AnswerDelta, AnswerRestart, ToolActivity
from .tutor import Tutor, TutorReply
from .unanswered import unanswered

logger = logging.getLogger(__name__)

# A question, or a pasted problem; far more is a cost attack, not a question.
MAX_MESSAGE_CHARS = 2000

FAILED_TURN = "Sorry, I couldn't answer that just now. Please try again."
TOO_LONG = "That message is too long for me to read. Please send a shorter question."

# The answer streams as chunks of this one artifact; the completed status
# carries the finished answer.
ANSWER_ARTIFACT = "answer"


class TutorExecutor(AgentExecutor):
    """One A2A message is one tutor turn. The learner's situation arrives as
    message metadata; the reply is the answer as text beside a data part for
    the app. The record and lessons read are those of the device the session
    names."""

    def __init__(self, tutor: Tutor, keeping: Keeping) -> None:
        self._tutor = tutor
        self._keeping = keeping

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task = context.current_task or new_task_from_user_message(context.message)
        if context.current_task is None:
            await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue, task.id, task.context_id)

        message = context.get_user_input()
        if len(message) > MAX_MESSAGE_CHARS:
            await updater.reject(updater.new_agent_message([new_text_part(TOO_LONG)]))
            return

        await updater.start_work()
        try:
            turn = await self._turn(context, task.context_id, message)
            reply = await _relay(updater, turn)
        except Exception:
            logger.exception("Tutor turn failed")
            await updater.failed(
                updater.new_agent_message([new_text_part(FAILED_TURN)])
            )
            return
        await updater.complete(updater.new_agent_message(reply_parts(reply)))

    async def _turn(
        self, context: RequestContext, conversation_id: str, message: str
    ) -> AsyncIterator:
        caller = Caller(learner_of(context), self._keeping)
        record = await caller.record()
        if caller.learner and conversation_id not in record.conversations:
            await caller.change(Conversed(conversation_id=conversation_id))
        learner = await with_kept_lesson(
            LearnerContext.from_metadata(learner_metadata(context)),
            record,
            self._keeping.lessons,
        )
        parts = message_parts(context)
        return self._tutor.stream(
            conversation_id,
            message,
            learner,
            app_calls(parts),
            unanswered(parts),
            notes_for(record, learner.plan_id, learner.subject_slug),
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise UnsupportedOperationError()


async def _relay(updater: TaskUpdater, turn: AsyncIterator) -> TutorReply:
    """The turn as it happens: the answer as chunks of one artifact, and each
    tool as a working status the app can name."""
    reply = None
    streamed = False
    async for item in turn:
        if isinstance(item, AnswerDelta):
            await updater.add_artifact(
                [new_text_part(item.text)],
                artifact_id=ANSWER_ARTIFACT,
                name="answer",
                append=streamed,
            )
            streamed = True
        elif isinstance(item, AnswerRestart):
            # Replacing the artifact with nothing withdraws what streamed.
            await updater.add_artifact(
                [new_text_part("")],
                artifact_id=ANSWER_ARTIFACT,
                name="answer",
                append=False,
            )
        elif isinstance(item, ToolActivity):
            activity = updater.new_agent_message(
                [new_data_part({"activity": item.tool})]
            )
            await updater.update_status(TaskState.TASK_STATE_WORKING, message=activity)
        else:
            reply = item
    if reply is None:
        raise RuntimeError("The tutor turn ended without a reply")
    return reply


def learner_of(context: RequestContext) -> str | None:
    session = context.call_context.state.get("auth")
    return getattr(session, "learner", None)


def message_parts(context: RequestContext) -> list[dict]:
    message = context.message
    return [MessageToDict(part) for part in message.parts] if message else []


def learner_metadata(context: RequestContext) -> dict:
    message = context.message
    return (
        MessageToDict(message.metadata)
        if message is not None and message.HasField("metadata")
        else {}
    )


def reply_parts(reply: TutorReply) -> list:
    return [
        new_text_part(reply.answer),
        new_data_part(
            ReplyData(
                follow_ups=reply.follow_ups, actions=reply.actions, cards=reply.cards
            ).model_dump(by_alias=True)
        ),
    ]


def build_agent_card(settings: Settings) -> AgentCard:
    """Written out, so the public card describes the tutor, not its prompt."""
    return AgentCard(
        name="graspy-tutor",
        description="Tutor for secondary school learners: explains what they are "
        "studying, and changes their plan: opens or adds topics and subjects, "
        "proposes paths to goals beyond their grade, and rebuilds it. Send the "
        "learner's situation as message metadata under 'learner'.",
        version="0.1.0",
        supported_interfaces=[
            AgentInterface(
                url=f"{settings.public_base_url}{settings.a2a_path_prefix}",
                protocol_binding="JSONRPC",
                protocol_version="1.0",
            )
        ],
        capabilities=AgentCapabilities(streaming=True),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        skills=[
            AgentSkill(
                id="explain-topic",
                name="explain_topic",
                description="Answer a learner's question about a topic they are studying.",
                tags=["tutoring"],
            ),
            AgentSkill(
                id="open-topic",
                name="open_topic",
                description="Open a topic from the learner's subject when they ask to go to it. "
                "The reply carries an open_topic action for the learner's app.",
                tags=["curriculum", "navigation"],
            ),
        ],
    )


def a2a_routes(settings: Settings, tutor: Tutor, keeping: Keeping) -> list:
    card = build_agent_card(settings)
    handler = DefaultRequestHandler(
        agent_executor=TutorExecutor(tutor, keeping),
        # A task lives only as long as the request that streams it.
        task_store=InMemoryTaskStore(),
        agent_card=card,
    )
    prefix = settings.a2a_path_prefix
    return [
        # Well-known URIs are not path-scoped (RFC 8615).
        *create_agent_card_routes(card),
        *create_agent_card_routes(
            card, card_url=f"{prefix}/.well-known/agent-card.json"
        ),
        *create_jsonrpc_routes(handler, prefix, enable_v0_3_compat=True),
    ]
