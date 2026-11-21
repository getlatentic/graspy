"""The skills in effect on a turn. Each exchange keeps the skills in effect after
its turn, each with the turns since it was last loaded, and the topic. A skill
carries into the next turn while the topic is the same and it was loaded fewer
than MAX_AGE_TURNS turns ago; loading it again starts the count over. Only
names are kept: the text is read from the registry each turn, so a skill edited
in a deploy applies at once."""

from __future__ import annotations

import logging
from collections.abc import Sequence

from ..memory import Exchange
from .registry import skills

logger = logging.getLogger(__name__)

# The most skills in effect at once; the most recently loaded win.
MAX_ACTIVE = 2
# A skill is in effect while it was loaded fewer turns ago than this.
MAX_AGE_TURNS = 6
NONE_IN_EFFECT = "None."


def same_topic(a: str | None, b: str | None) -> bool:
    return " ".join((a or "").lower().split()) == " ".join((b or "").lower().split())


def _youngest(ages: dict[str, int]) -> dict[str, int]:
    return dict(sorted(ages.items(), key=lambda item: item[1])[:MAX_ACTIVE])


def in_effect(exchanges: Sequence[Exchange], topic: str | None) -> dict[str, int]:
    """The skills in effect for a new turn on `topic`, each with the turns since
    it was loaded, the most recently loaded first. A name the registry no longer
    has is dropped before the cut, so it takes no slot."""
    if not exchanges or not same_topic(exchanges[-1].get("topic"), topic):
        return {}
    known = skills()
    ages: dict[str, int] = {}
    for name, age in exchanges[-1].get("skills", {}).items():
        if name not in known:
            logger.info("The skill %r is no longer shipped, so it is dropped", name)
        elif age + 1 < MAX_AGE_TURNS:
            ages[name] = age + 1
    return _youngest(ages)


def stamped(
    exchange: Exchange,
    history: Sequence[Exchange],
    topic: str | None,
    loaded: Sequence[str] = (),
) -> Exchange:
    """The exchange with the skills in effect after its turn: those carried from
    `history`, and the ones the turn loaded, at age 0."""
    kept = _youngest({**in_effect(history, topic), **dict.fromkeys(loaded, 0)})
    if kept:
        exchange["skills"] = kept
        exchange["topic"] = topic or ""
    return exchange


def rendered(names: Sequence[str]) -> str:
    """The text of each skill in effect, for the tutor's input."""
    if not names:
        return NONE_IN_EFFECT
    known = skills()
    return "\n\n".join(f"Skill in effect: {name}\n{known[name].body}" for name in names)
