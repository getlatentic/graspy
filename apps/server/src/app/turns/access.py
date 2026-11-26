"""Who may start, read and stop a chat's turns: the owner of the chat, who began it. An owner is a
signed-in account's learner, or a visitor with no account (the web's /try) by the id their browser
holds. A session with neither owns nothing and is refused every chat.

A chat that is another's and a chat that does not exist are refused the same way, so an id is never
an oracle."""

from __future__ import annotations

from ..chatlog import kinds
from ..chatlog.log import ChatLog
from ..security.guard import Session

VISITOR_PREFIX = "visitor:"


def chat_learner(session: Session) -> str | None:
    """Whose record a turn is kept under: the account's learner, and no one for a visitor with no
    account, whatever device the session names."""
    return session.learner if session.account else None


def chat_owner(session: Session) -> str | None:
    """Who the session's chats belong to, or None for a session that owns none."""
    if session.account:
        return session.learner
    return f"{VISITOR_PREFIX}{session.visitor}" if session.visitor else None


async def _first_owner(log: ChatLog, chat: str) -> tuple[bool, str | None]:
    first = await log.since(chat, 0, 1, (kinds.TURN_STARTED,))
    if not first:
        return False, None
    job = first[0].data.get("job", {})
    return True, job.get("owner", job.get("learner"))


async def may_start(log: ChatLog, chat: str, owner: str | None) -> bool:
    """A new chat, or one the owner began."""
    if owner is None:
        return False
    begun, first = await _first_owner(log, chat)
    return not begun or first == owner


async def may_follow(log: ChatLog, chat: str, owner: str | None) -> bool:
    """A chat the owner began: to read its turns and to stop them."""
    if owner is None:
        return False
    begun, first = await _first_owner(log, chat)
    return begun and first == owner
