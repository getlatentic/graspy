"""Who may start, read and stop a chat's turns: the learner whose turn began the chat.

A chat that is another learner's and a chat that does not exist are refused the same way, so an id
is never an oracle."""

from __future__ import annotations

from ..chatlog import kinds
from ..chatlog.log import ChatLog
from ..security.guard import Session


def chat_learner(session: Session) -> str | None:
    """Whose record a turn is kept under, and who owns its chat: the account's learner, and no one
    for a visitor with no account, whatever device the session names. A chat of no one is held by
    its id alone, which the page makes at random."""
    return session.learner if session.account else None


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
