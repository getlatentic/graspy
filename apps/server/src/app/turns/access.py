"""Who may start, read and stop a chat's turns: the learner whose turn began the chat.

A chat that is another learner's and a chat that does not exist are refused the same way, so an id
is never an oracle."""

from __future__ import annotations

from ..chatlog import kinds
from ..chatlog.log import ChatLog


async def _first_learner(log: ChatLog, chat: str) -> tuple[bool, str | None]:
    first = await log.since(chat, 0, 1, (kinds.TURN_STARTED,))
    if not first:
        return False, None
    return True, first[0].data.get("job", {}).get("learner")


async def may_start(log: ChatLog, chat: str, learner: str | None) -> bool:
    """A new chat, or one the learner began."""
    begun, owner = await _first_learner(log, chat)
    return not begun or owner == learner


async def may_follow(log: ChatLog, chat: str, learner: str | None) -> bool:
    """A chat the learner began: to read its turns and to stop them."""
    begun, owner = await _first_learner(log, chat)
    return begun and owner == learner
