"""The learner's messages whose turns failed, sent again with the next: a
"continue" means nothing without them, and the failed request may never have
reached the server's memory."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

PART_KEY = "unanswered"
MAX_UNANSWERED = 3
MAX_TEXT = 600
# What the tutor reads, and remembers, in place of the answer that never came.
NO_ANSWER = "(No answer reached the learner: the reply failed.)"


def unanswered(parts: Iterable[Mapping[str, Any]]) -> list[str]:
    for part in parts:
        data = part.get("data")
        if isinstance(data, Mapping) and isinstance(data.get(PART_KEY), list):
            texts = (
                " ".join(text.split())[:MAX_TEXT]
                for text in data[PART_KEY]
                if isinstance(text, str)
            )
            return [text for text in texts if text][-MAX_UNANSWERED:]
    return []
