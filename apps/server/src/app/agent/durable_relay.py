"""A durable turn's events as the A2A task's updates."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from a2a.helpers.proto_helpers import new_data_part, new_text_part
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState

from ..chatlog import kinds
from ..chatlog.log import Event

ANSWER_ARTIFACT = "answer"


class TurnFailed(Exception):
    """The turn ended without an answer; `cause` says why."""

    def __init__(self, cause: str) -> None:
        super().__init__(cause)
        self.cause = cause


def payload_parts(payload: dict[str, Any]) -> list:
    return [new_text_part(payload["answer"]), new_data_part(payload["data"])]


async def relay_events(updater: TaskUpdater, events: AsyncIterator[Event]) -> dict:
    """Writes the turn's words to the task as they come, withdraws those a run did not finish, and
    returns the finished reply. Raises TurnFailed when the turn failed."""
    streamed = False
    async for event in events:
        if event.kind == kinds.TEXT:
            await updater.add_artifact(
                [new_text_part(event.data["text"])],
                artifact_id=ANSWER_ARTIFACT,
                name="answer",
                append=streamed,
            )
            streamed = True
        elif event.kind == kinds.ROUND_ABORTED:
            if streamed:
                await updater.add_artifact(
                    [new_text_part("")],
                    artifact_id=ANSWER_ARTIFACT,
                    name="answer",
                    append=False,
                )
                streamed = False
        elif event.kind == kinds.TOOL_STARTED:
            activity = updater.new_agent_message(
                [new_data_part({"activity": event.data["tool"]})]
            )
            await updater.update_status(TaskState.TASK_STATE_WORKING, message=activity)
        elif event.kind == kinds.TURN_FINISHED:
            if event.data.get("status") == "ok":
                return event.data["reply"]
            raise TurnFailed(str(event.data.get("cause", "failed")))
    raise TurnFailed("unfinished")
