"""A name or title that came from a model or a learner's message, made safe to keep in a plan and
to show: one line, cut to a length, with no control characters and none of the marks a card's
answer is written with."""

from __future__ import annotations

import unicodedata

# The longest a course's name, a topic's title and its level are kept.
MAX_GOAL = 80
MAX_TITLE = 80
MAX_LEVEL = 40
# The mark the path card's answer splits a topic from its level on (agent/path_answer.py).
SEPARATOR = "|"
LEADING = " -•*·"


def _kept(char: str) -> bool:
    if char.isspace():
        return True
    return char != SEPARATOR and not unicodedata.category(char).startswith("C")


def clean_title(text: object, limit: int) -> str:
    """The text as one tidy line of at most ``limit`` characters; empty for what is not text or has
    nothing left."""
    if not isinstance(text, str):
        return ""
    folded = unicodedata.normalize("NFKC", text)
    line = "".join(char for char in folded if _kept(char))
    return " ".join(line.split()).lstrip(LEADING)[:limit].rstrip()
