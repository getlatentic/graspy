"""The model writes answer options one per line, so their LaTeX needs no
JSON escaping."""

from __future__ import annotations

import re

# A line's marker: "- ", "* ", "• ", "A) ", "b. ", "1) " or "2. ". The model
# sometimes marks a line twice, "- - 0.875" or "- A) 0.875": a bullet may be
# followed by more bullets and one letter.
_MARKER = re.compile(
    r"^\s*(?:[-*•]|[A-Da-d][).]|\d+[).])\s+(?:[-*•]\s+)*(?:[A-Da-d][).]\s+)?"
)


def option_lines(text: str) -> list[str]:
    return [
        _MARKER.sub("", line).strip()
        for line in text.splitlines()
        if _MARKER.sub("", line).strip()
    ]


def as_option_lines(options: list[str]) -> str:
    return "\n".join(f"- {option}" for option in options)


def checked_answer(index: int, options: list[str]) -> int:
    """An answer pointing past the list would mark every choice wrong."""
    if not 0 <= index < len(options):
        raise ValueError(f"Answer {index} is not one of {len(options)} options")
    return index
