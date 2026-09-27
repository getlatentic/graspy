"""A learner's conversations with the tutor as their devices send and read
them. A thread is what one conversation is about (its scope) and its messages;
the server keeps what a device sends, and a message too long or a card too
large is cut rather than refused, so a device is never left holding what it
can never send."""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Literal

from pydantic import (
    BeforeValidator,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

from ..learner.record import Id, Name
from ..wire import Wire

logger = logging.getLogger(__name__)

# A learner keeps a thread for each topic they asked about; past these the
# oldest threads, and a thread's oldest messages, are dropped.
MAX_THREADS = 500
MAX_MESSAGES = 400
MAX_CONTENT = 20_000
MAX_PREVIEW = 2_000
MAX_METADATA_CHARS = 64_000
# What one request may carry; a device sends more in several.
MAX_SENT_THREADS = 50
MAX_SENT_MESSAGES = 200
PAGE = 100

WireId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,120}$")]


def _cut(limit: int):
    return BeforeValidator(
        lambda value: value[:limit] if isinstance(value, str) else value
    )


class TopicScope(Wire):
    kind: Literal["topic"]
    plan_id: Id
    subject_slug: Id
    topic: Name


class SubjectScope(Wire):
    kind: Literal["subject"]
    plan_id: Id
    subject_slug: Id


class GeneralScope(Wire):
    kind: Literal["general"]
    plan_id: Id


class EarlierScope(Wire):
    """The web's one conversation from before conversations were kept by topic."""

    kind: Literal["earlier"]


Scope = Annotated[
    TopicScope | SubjectScope | GeneralScope | EarlierScope,
    Field(discriminator="kind"),
]


def scope_key(scope: TopicScope | SubjectScope | GeneralScope | EarlierScope) -> str:
    return json.dumps(
        scope.model_dump(by_alias=True), sort_keys=True, separators=(",", ":")
    )


class SentMessage(Wire):
    id: WireId
    # The learner's question, the tutor's answer, and what the app did.
    type: Literal["user", "system", "complete"]
    content: Annotated[str, _cut(MAX_CONTENT)]
    timestamp: int = Field(ge=0)
    # A message whose card a view changed is sent again; the latest edit wins.
    edited_at: int = Field(default=0, ge=0)
    metadata: dict[str, Any] | None = None

    @field_validator("metadata")
    @classmethod
    def _sized(cls, metadata: dict[str, Any] | None) -> dict[str, Any] | None:
        if metadata is not None and len(json.dumps(metadata)) > MAX_METADATA_CHARS:
            logger.warning(
                "A message's metadata is over the size limit and is left out"
            )
            return None
        return metadata

    @model_validator(mode="after")
    def _edited_once_made(self) -> SentMessage:
        if self.edited_at < self.timestamp:
            return self.model_copy(update={"edited_at": self.timestamp})
        return self


_MESSAGE = TypeAdapter(SentMessage)


def _readable(adapter: TypeAdapter, items: list[Any], what: str) -> list:
    """One item a device cannot have meant, or an older app does not know, is
    left out rather than refusing everything sent with it."""
    kept = []
    for item in items:
        try:
            kept.append(adapter.validate_python(item))
        except ValidationError:
            logger.warning("A %s a device sent is malformed and is left out", what)
    return kept


class SentThread(Wire):
    id: WireId
    scope: Scope
    agent_context_id: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    preview: Annotated[str, _cut(MAX_PREVIEW)] | None = None
    created_at: int = Field(ge=0)
    updated_at: int = Field(ge=0)
    messages: list[Any] = Field(default_factory=list, max_length=MAX_SENT_MESSAGES)

    @field_validator("messages")
    @classmethod
    def _messages(cls, messages: list[Any]) -> list[SentMessage]:
        return _readable(_MESSAGE, messages, "message")

    @property
    def key(self) -> str:
        return scope_key(self.scope)


_THREAD = TypeAdapter(SentThread)


class SentThreads(Wire):
    threads: list[Any] = Field(max_length=MAX_SENT_THREADS)

    @field_validator("threads")
    @classmethod
    def _threads(cls, threads: list[Any]) -> list[SentThread]:
        read = _readable(_THREAD, threads, "thread")
        if sum(len(thread.messages) for thread in read) > MAX_SENT_MESSAGES:
            raise ValueError(f"At most {MAX_SENT_MESSAGES} messages at once")
        return read


class KeptMessage(Wire):
    id: str
    type: str
    content: str
    timestamp: int
    edited_at: int
    metadata: dict[str, Any] | None = None


class KeptThread(Wire):
    id: str
    scope: dict[str, Any]
    agent_context_id: str | None = None
    preview: str | None = None
    created_at: int
    updated_at: int
    # What changed since the device last read, not the whole conversation.
    messages: list[KeptMessage] = Field(default_factory=list)


class Changes(Wire):
    """One page of what changed. The device asks again with ``next`` until it
    is null, each time with the same ``up_to``, then reads from ``up_to``."""

    up_to: int
    threads: list[KeptThread]
    next: str | None = None
