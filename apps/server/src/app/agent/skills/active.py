"""The skills in effect on a turn: the ones loaded in the conversation's last few
turns, on the same topic. The conversation keeps their names; their text is read
from the registry each turn, so a skill edited in a deploy applies at once."""

from __future__ import annotations

import logging
from collections.abc import Sequence

from ..memory import Exchange
from .registry import skills

logger = logging.getLogger(__name__)

# The most skills in effect at once; the most recently loaded win.
MAX_ACTIVE = 2
# A skill loaded this many turns ago, or fewer, is still in effect.
MAX_AGE_TURNS = 3
NONE_IN_EFFECT = "None: no teaching method from an earlier turn is in effect."


def active_names(exchanges: Sequence[Exchange], topic: str | None) -> tuple[str, ...]:
    """Names of the skills in effect for a new turn on `topic`, most recent first.
    A skill loaded on another topic is not: the conversation has moved on."""
    found: list[str] = []
    for exchange in reversed(exchanges[-MAX_AGE_TURNS:]):
        if exchange.get("topic", "") != (topic or ""):
            continue
        for name in reversed(exchange.get("skills", [])):
            if name not in found:
                found.append(name)
    return tuple(found[:MAX_ACTIVE])


def still_shipped(names: Sequence[str]) -> tuple[str, ...]:
    """The names the registry still has: a skill removed in a deploy is dropped."""
    known = skills()
    for name in names:
        if name not in known:
            logger.info("The skill %r is no longer shipped, so it is dropped", name)
    return tuple(name for name in names if name in known)


def rendered(names: Sequence[str]) -> str:
    """The text of each skill in effect, for the tutor's input."""
    if not names:
        return NONE_IN_EFFECT
    known = skills()
    return "\n\n".join(f"Skill in effect: {name}\n{known[name].body}" for name in names)
