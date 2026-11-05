"""What a turn needs to be run: the learner's message and everything that came with it, kept in the
turn's first event, so a run that begins after a restart has it."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel, Field

from ..agent.app_tools import app_calls
from ..agent.context import LearnerContext, with_kept_lesson
from ..agent.reply import ReplyData
from ..agent.tutor import Tutor, TutorReply
from ..agent.unanswered import unanswered
from ..caller import Caller, Keeping
from ..learner.notes import notes_for
from ..learner.record import Conversed

# A question, or a pasted problem; far more is a cost attack, not a question.
MAX_MESSAGE_CHARS = 2000


class TurnJob(BaseModel):
    chat: str
    turn: str
    # The learner's key, or None for a session that keeps no record.
    learner: str | None = None
    message: str
    # The parts of the A2A message, as dicts: app calls and the messages whose turns failed.
    parts: list[dict[str, Any]] = Field(default_factory=list)
    # The message's metadata: the learner's situation under "learner".
    metadata: dict[str, Any] = Field(default_factory=dict)


def reply_payload(reply: TutorReply) -> dict[str, Any]:
    """The finished reply, as it is kept in the turn's last event."""
    data = ReplyData(
        follow_ups=reply.follow_ups, actions=reply.actions, cards=reply.cards
    )
    return {"answer": reply.answer, "data": data.model_dump(by_alias=True, mode="json")}


def words_payload(answer: str) -> dict[str, Any]:
    """The reply of a turn that ended with words and nothing else: the learner stopped it."""
    return {
        "answer": answer,
        "data": ReplyData().model_dump(by_alias=True, mode="json"),
    }


def tutor_stream(tutor: Tutor, keeping: Keeping, job: TurnJob) -> AsyncIterator:
    """The tutor's turn for the job: what the learner's record, the lesson they were given and the
    app's calls tell it, and the stream of what it does."""
    return _stream(tutor, keeping, job)


async def _stream(tutor: Tutor, keeping: Keeping, job: TurnJob) -> AsyncIterator:
    caller = Caller(job.learner, keeping)
    record = await caller.record()
    if caller.learner and job.chat not in record.conversations:
        await caller.change(Conversed(conversation_id=job.chat))
    learner = await with_kept_lesson(
        LearnerContext.from_metadata(job.metadata), record, keeping.lessons
    )
    async for item in tutor.stream(
        job.chat,
        job.message,
        learner,
        app_calls(job.parts),
        unanswered(job.parts),
        notes_for(record, learner.plan_id, learner.subject_slug),
        turn=job.turn,
    ):
        yield item
