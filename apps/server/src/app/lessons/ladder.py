"""The help a wrong answer to a lesson's check is given, least first: look at the slide again, then two options
left, then the answer told. The next help depends only on what was chosen, so any call can be repeated."""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from typing import Literal

# A learner who has chosen this many wrong options is told the answer.
TRIES_BEFORE_TOLD = 3

HelpKind = Literal["cue", "narrow", "told"]


@dataclass(frozen=True)
class Help:
    kind: HelpKind
    # The options still to choose from; only a "narrow" help names them.
    keep: tuple[int, ...] = ()


def next_help(option_count: int, answer_index: int, wrong: Collection[int]) -> Help:
    """What follows a wrong choice, given every wrong option chosen so far, this one included."""
    tried = set(wrong)
    untried = [index for index in range(option_count) if index not in tried]
    if len(untried) <= 1 or len(tried) >= TRIES_BEFORE_TOLD:
        return Help("told")
    if len(tried) == 1:
        return Help("cue")
    other = next(index for index in untried if index != answer_index)
    return Help("narrow", tuple(sorted((answer_index, other))))
