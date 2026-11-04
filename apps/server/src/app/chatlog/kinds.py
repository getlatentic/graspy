"""The kinds of event a chat's log holds. A kind is checked where an event is written."""

from __future__ import annotations

USER = "user"
TEXT = "text"
ASSISTANT = "assistant"
TOOL_STARTED = "tool.started"
TOOL = "tool"
CARD = "card"
NOTICE = "notice"
TURN_STARTED = "turn.started"
TURN_FINISHED = "turn.finished"
ROUND_ABORTED = "round.aborted"
COMPACTION = "compaction"
IMPORTED = "imported"

KINDS = frozenset(
    {
        USER,
        TEXT,
        ASSISTANT,
        TOOL_STARTED,
        TOOL,
        CARD,
        NOTICE,
        TURN_STARTED,
        TURN_FINISHED,
        ROUND_ABORTED,
        COMPACTION,
        IMPORTED,
    }
)
