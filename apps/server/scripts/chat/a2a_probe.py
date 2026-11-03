"""A small A2A client for measuring the tutor chat: one streamed turn as a
list of timed events, which a caller can stop reading at any point."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

import httpx
from a2a.client import ClientConfig, ClientFactory
from a2a.client.client_factory import minimal_agent_card
from a2a.client.errors import A2AClientError
from a2a.types import Message, Part, Role, SendMessageRequest, SubscribeToTaskRequest
from google.protobuf.struct_pb2 import Struct

LEARNER = {"country": "Nigeria", "language": "English", "gradeLevel": "JSS 1"}
TIMEOUT_SECONDS = 120.0


@dataclass
class Seen:
    """What the client saw of one turn, with seconds since it sent."""

    started: float = field(default_factory=time.monotonic)
    events: list[tuple[float, str]] = field(default_factory=list)
    text: str = ""
    task_id: str = ""
    context_id: str = ""
    finished: bool = False
    error: str = ""

    def note(self, kind: str) -> None:
        self.events.append((round(time.monotonic() - self.started, 2), kind))

    def first(self, kind: str) -> float | None:
        return next((at for at, seen in self.events if seen == kind), None)


class Tutor:
    def __init__(self, base: str, token: str, a2a_path: str = "/a2a") -> None:
        self._http = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {token}"},
            timeout=httpx.Timeout(TIMEOUT_SECONDS, connect=15.0),
        )
        card = minimal_agent_card(f"{base}{a2a_path}", ["JSONRPC"])
        card.capabilities.streaming = True
        self._client = ClientFactory(ClientConfig(httpx_client=self._http)).create(card)

    async def close(self) -> None:
        await self._http.aclose()

    @staticmethod
    def request(text: str, context_id: str = "") -> SendMessageRequest:
        metadata = Struct()
        metadata.update({"learner": LEARNER})
        message = Message(
            message_id=str(uuid.uuid4()),
            role=Role.ROLE_USER,
            parts=[Part(text=text)],
            metadata=metadata,
        )
        if context_id:
            message.context_id = context_id
        return SendMessageRequest(message=message)

    async def turn(
        self, text: str, context_id: str = "", stop_after: str | None = None
    ) -> Seen:
        """Sends one message and reads the stream until it ends, or until the
        first event of kind `stop_after` (`task`, `delta` or `status`), when the
        client drops the connection."""
        seen = Seen()
        events = self._client.send_message(self.request(text, context_id))
        try:
            async for response in events:
                kind = self._record(response, seen)
                if kind == stop_after:
                    break
        except (A2AClientError, httpx.HTTPError) as error:
            seen.error = f"{type(error).__name__}: {error}"[:200]
        finally:
            await events.aclose()
        return seen

    async def subscribe(self, task_id: str) -> Seen:
        seen = Seen()
        try:
            async for response in self._client.subscribe(
                SubscribeToTaskRequest(id=task_id)
            ):
                self._record(response, seen)
        except (A2AClientError, httpx.HTTPError) as error:
            seen.error = f"{type(error).__name__}: {error}"[:200]
        return seen

    @staticmethod
    def _record(response, seen: Seen) -> str:
        which = response.WhichOneof("payload")
        if which == "task":
            seen.task_id = response.task.id
            seen.context_id = response.task.context_id
            seen.note("task")
            return "task"
        if which == "artifact_update":
            piece = "".join(
                part.text for part in response.artifact_update.artifact.parts
            )
            seen.text = seen.text + piece if response.artifact_update.append else piece
            seen.note("delta")
            return "delta"
        if which == "status_update":
            state = response.status_update.status.state
            seen.note(f"status:{state}")
            if state == 3:  # TASK_STATE_COMPLETED
                seen.finished = True
                for part in response.status_update.status.message.parts:
                    if part.text:
                        seen.text = part.text
            return "status"
        seen.note(which or "empty")
        return which or "empty"


async def session_token(base: str, device: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as http:
        answered = await http.post(f"{base}/api/session", json={"deviceId": device})
        answered.raise_for_status()
        return answered.json()["token"]
