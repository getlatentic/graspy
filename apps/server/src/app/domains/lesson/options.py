"""The model writes answer options one per line, so their LaTeX needs no
JSON escaping."""

from __future__ import annotations

import re
import string

# A line's own bullet: "- ", "* " or "• ". A minus written "-3" has no space.
_BULLET = re.compile(r"^\s*[-*•](?:\s+|$)")
# "A) ", "b. ", "1) " or "2. ".
_LABEL = re.compile(r"^([A-Ea-e]|\d+)[).]\s+")
# "A. Adebayo" is as likely an initial as a label; "A) Adebayo" is a label.
_INITIAL = re.compile(r"^[A-Ea-e]\.\s+[A-Z]")


def _distinct(options: list[str]) -> bool:
    """None empty, and no two the same: a mark taken away must leave options
    a learner can tell apart."""
    kept = [option.strip() for option in options]
    return all(kept) and len(set(kept)) == len(kept)


def _without_shared_bullet(options: list[str]) -> list[str]:
    """A second bullet, "- - 0.875", only when every option has one: alone,
    "- 5" is minus five."""
    while len(options) > 1 and all(_BULLET.match(option) for option in options):
        stripped = [_BULLET.sub("", option, count=1) for option in options]
        if not _distinct(stripped):
            break
        options = stripped
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
    "D. O. Fagunwa", "b) and c) only" and "a) only, b) only" are answers,
    not labels."""
    found = [_LABEL.match(option) for option in options]
    if len(options) < 2 or not all(found):
        return options
    if not _labelled_in_order([match.group(1) for match in found]):
        return options
    if any(_INITIAL.match(option) for option in options):
        return options
    stripped = [option[match.end() :] for option, match in zip(options, found)]
    return stripped if _distinct(stripped) else options


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
