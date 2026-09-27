"""The model writes answer options one per line, so their LaTeX needs no
JSON escaping."""

from __future__ import annotations

import re
import string

# A line's own bullet: "- ", "* " or "• ". A minus written "-3" has no space.
_BULLET = re.compile(r"^\s*[-*•](?:\s+|$)")
# "A) ", "b. ", "1) " or "2. ".
_LABEL = re.compile(r"^([A-Ea-e]|\d+)[).]\s+")


def _without_shared_bullet(options: list[str]) -> list[str]:
    """A second bullet, "- - 0.875", only when every option has one: alone,
    "- 5" is minus five."""
    while len(options) > 1 and all(_BULLET.match(option) for option in options):
        options = [_BULLET.sub("", option, count=1) for option in options]
    return options


def _labelled_in_order(labels: list[str]) -> bool:
    count = len(labels)
    return labels in (
        list(string.ascii_uppercase[:count]),
        list(string.ascii_lowercase[:count]),
        [str(n) for n in range(1, count + 1)],
    )


def _without_labels(options: list[str]) -> list[str]:
    """Labels only when they run A, B, C or 1, 2, 3 down every option:
    "D. O. Fagunwa" and "b) and c) only" are answers, not labels."""
    found = [_LABEL.match(option) for option in options]
    if len(options) < 2 or not all(found):
        return options
    if not _labelled_in_order([match.group(1) for match in found]):
        return options
    return [option[match.end() :] for option, match in zip(options, found)]


def option_lines(text: str) -> list[str]:
    bulleted = (_BULLET.sub("", line, count=1).strip() for line in text.splitlines())
    options = [option for option in bulleted if option]
    return [
        option.strip() for option in _without_labels(_without_shared_bullet(options))
    ]


def as_option_lines(options: list[str]) -> str:
    return "\n".join(f"- {option}" for option in options)


def checked_answer(index: int, options: list[str]) -> int:
    """An answer pointing past the list would mark every choice wrong."""
    if not 0 <= index < len(options):
        raise ValueError(f"Answer {index} is not one of {len(options)} options")
    return index
