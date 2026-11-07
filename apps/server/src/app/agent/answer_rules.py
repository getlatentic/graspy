"""What the tutor's answer must never say, a sentence at a time. Each rule is
a pattern over words the tutor wrote and a fact the server holds: the marking
of the learner's taps, the card this turn showed, the action this turn took.
A sentence that breaks a rule is never sent."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from .cards import Question
from .choices import plain


class Breach(Enum):
    VERDICT = "verdict"
    CARD = "card"
    CLAIM = "claim"


@dataclass(frozen=True)
class Facts:
    """What the turn has done so far, read when each sentence is judged."""

    verdicts: tuple[bool, ...]
    questions: tuple[Question, ...]
    acted: bool


_SAYS_RIGHT = re.compile(
    r"\b(?:that|it)(?:'s| is)\s+(?:\w+ly\s+)?(?:right|correct)\b(?!\s+to\b)"
    r"|\b(?:your answer is|you(?:'re| are))\s+(?:\w+ly\s+)?(?:right|correct)\b(?!\s+to\b)"
    r"|\byou got (?:it|that) right\b"
    r"|\bcorrect!|\bwell done\b|\bspot on\b"
)
_SAYS_WRONG = re.compile(
    r"\b(?:that|it)(?:'s| is)\s+(?:not\s+(?:quite\s+)?(?:right|correct)|incorrect|wrong)\b"
    r"|\b(?:your answer is|you(?:'re| are))\s+(?:not\s+(?:quite\s+)?(?:right|correct)|incorrect|wrong)\b"
)
_DONE = re.compile(
    r"\b(?:i(?:'ve| have| just))\s+(?:now\s+|just\s+)?"
    r"(?:added|opened|changed|switched|removed|dropped|rebuilt|started)\b"
    r"|\b(?:has|have) been (?:added|opened|changed|switched|removed|rebuilt)\b"
)
# The app opens a lesson or a subject, never the tutor: it says it is ready below.
_OPENED = re.compile(
    r"\bi(?:'ve| have| just)\s+(?:now\s+|just\s+)?opened\b"
    r"|\b(?:has|have) been opened\b|\bis now open\b"
)
_ABOUT_ANSWER = re.compile(r"\b(?:answer|correct|right)\b")


def _appears(sentence: str, option: str) -> bool:
    wanted = plain(option)
    return (
        bool(wanted)
        and re.search(rf"(?<!\w){re.escape(wanted)}(?!\w)", sentence) is not None
    )


def _leaks_card(sentence: str, question: Question) -> bool:
    """The question itself, a listing of its options, or its right answer."""
    if plain(question.question) in sentence:
        return True
    options = [_appears(sentence, option) for option in question.options]
    if sum(options) >= 2:
        return True
    return options[question.answer_index] and _ABOUT_ANSWER.search(sentence) is not None


def _marking(verdicts: tuple[bool, ...]) -> str:
    if not verdicts:
        return "none"
    if all(verdicts):
        return "right"
    return "wrong" if not any(verdicts) else "mixed"


def breach_in(sentence: str, facts: Facts) -> Breach | None:
    """The rule the sentence breaks, if any."""
    text = plain(sentence.replace("\u2019", "'"))
    if _OPENED.search(text) or (_DONE.search(text) and not facts.acted):
        return Breach.CLAIM
    marking = _marking(facts.verdicts)
    if (_SAYS_RIGHT.search(text) and marking in ("none", "wrong")) or (
        _SAYS_WRONG.search(text) and marking in ("none", "right")
    ):
        return Breach.VERDICT
    if any(_leaks_card(text, question) for question in facts.questions):
        return Breach.CARD
    return None
