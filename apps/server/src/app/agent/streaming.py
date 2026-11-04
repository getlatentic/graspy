"""What a tutor turn reports while it runs."""

from __future__ import annotations

import contextlib
from dataclasses import dataclass

import anyio
import dspy
from dspy.streaming import StatusMessageProvider


@dataclass(frozen=True)
class AnswerDelta:
    text: str


@dataclass(frozen=True)
class AnswerRestart:
    """What streamed of the answer is withdrawn: it is being written again."""


@dataclass(frozen=True)
class ToolActivity:
    tool: str


@dataclass(frozen=True)
class ToolFinished:
    """A tool the turn called has answered, or failed."""

    tool: str


class Silent(StatusMessageProvider):
    """DSPy announces tool calls through a thread pool, which a Worker cannot
    start; announce() does it instead."""

    def tool_start_status_message(self, instance, inputs):
        return None

    def tool_end_status_message(self, outputs):
        return None


def _send(item: ToolActivity | ToolFinished) -> None:
    stream = dspy.settings.send_stream
    if stream is not None:
        with contextlib.suppress(anyio.WouldBlock):
            stream.send_nowait(item)


def announce(tool: str) -> None:
    """Puts a ToolActivity on the turn's stream, never waiting: a missing
    status line serves the learner better than a stalled answer. A tool that must
    not be sent twice could not rely on this to say it began."""
    _send(ToolActivity(tool))


def announce_done(tool: str) -> None:
    """Says the tool has answered, in the same way."""
    _send(ToolFinished(tool))
