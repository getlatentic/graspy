"""What the tutor's answer must never say, a sentence at a time. Each rule is
a pattern over words the tutor wrote and a fact the server holds: the marking
of the learner's taps, the card this turn showed, the action this turn took.
A sentence that breaks a rule is never sent."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from .cards import Question
from .choices import plain, states


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


_NOT_A_VERDICT = (
    r"(?!\s+(?:to|there|here|under|above|below|in|on|at|next|beside|now)\b)"
)
# An opener that goes on to teach: "Exactly how many", "Perfect, let us start", "Not quite sure".
_CONTINUES_TEACHING = r"(?![,\s]+(?:how|what|why|which|when|let|now|sure|certain)\b)"
_SUBJECT = r"(?:[\d.,/]+|answer|one|option|choice)"
_SAYS_RIGHT = re.compile(
    r"\b(?:that|it)(?:'s| is)\s+(?:\w+ly\s+)?(?:right|correct)\b"
    + _NOT_A_VERDICT
    + r"|\b(?:that|it)(?:'s| is)\s+the\s+(?:right|correct)\s+(?:answer|one|choice|option)\b(?!\s+(?:to|for)\b)"
    + r"|\b(?:your answer is|you(?:'re| are))\s+(?:\w+ly\s+)?(?:right|correct)\b"
    + _NOT_A_VERDICT
    + rf"|\b{_SUBJECT} is (?:right|correct)\b"
    + _NOT_A_VERDICT
    + r"|\byou got (?:it|that) right\b|\byou got (?:it|that)!"
    r"|\bcorrect!|\bwell done\b|\bspot on\b"
    r"|^\W*(?:correct|exactly|perfect)\b" + _CONTINUES_TEACHING + r"|^\W*right\s*[.!]"
)
_SAYS_WRONG = re.compile(
    r"\b(?:that|it)(?:'s| is)\s+(?:incorrect|wrong)\b(?!\s+to\b)"
    r"|\b(?:that|it)(?:'s| is)\s+not\s+(?:quite\s+)?(?:right|correct)\b(?!\s+to\b)"
    r"|\b(?:that|it) isn't\s+(?:quite\s+)?(?:right|correct)\b(?!\s+to\b)"
    r"|\b(?:your answer is|you(?:'re| are))\s+(?:not\s+(?:quite\s+)?(?:right|correct)|incorrect|wrong)\b"
    r"|^\W*(?:nope|not quite|incorrect|wrong)\b" + _CONTINUES_TEACHING
)
_VERBS = r"(?:added|opened|changed|switched|removed|dropped|rebuilt|started|updated|reset|cleared|created)"
_DONE = re.compile(
    rf"\bi(?:'ve|\s+have|\s+just|\s+now)?\s+(?:now\s+|just\s+)?{_VERBS}\b"
    rf"|\b(?:has|have) been {_VERBS}\b|\bis now (?:in|on) your\b"
)
# What a change of the plan is a change of; "I've added 3 and 4" is arithmetic.
_PLAN = re.compile(r"\b(?:plan|subjects?|topics?|lessons?|path)\b")
# The app opens a lesson or a subject, never the tutor: it says it is ready below.
_OPENED = re.compile(
    r"\bi(?:'ve|\s+have|\s+just)?\s+(?:now\s+|just\s+)?opened\b"
    r"|\b(?:has|have) been opened\b|\bis now open\b"
)
_PIECE = re.compile(r"(?<=[.!?])\s+|\n+")
MIN_PIECE = 12


def _appears(sentence: str, option: str) -> bool:
    wanted = plain(option)
    return (
        bool(wanted)
        and re.search(rf"(?<![\w./]){re.escape(wanted)}(?![\w/]|\.\d)", sentence)
        is not None
    )


def _leaks_card(sentence: str, question: Question) -> bool:
    """A sentence of the question, a listing of its options, or its right answer."""
    pieces = (piece.strip() for piece in _PIECE.split(plain(question.question)))
    if any(len(piece) >= MIN_PIECE and piece in sentence for piece in pieces):
        return True
    if sum(_appears(sentence, option) for option in question.options) >= 2:
        return True
    return states(sentence, question.options[question.answer_index], question.question)


def _marking(verdicts: tuple[bool, ...]) -> str:
    if not verdicts:
        return "none"
    if all(verdicts):
        return "right"
    return "wrong" if not any(verdicts) else "mixed"


def breach_in(sentence: str, facts: Facts) -> Breach | None:
    """The rule the sentence breaks, if any."""
    text = plain(sentence.replace("\u2019", "'"))
    if _OPENED.search(text) or (
        _DONE.search(text) and _PLAN.search(text) and not facts.acted
    ):
        return Breach.CLAIM
    marking = _marking(facts.verdicts)
    if text.rstrip().endswith("?"):
        marking = "asked"
    if (_SAYS_RIGHT.search(text) and marking in ("none", "wrong", "mixed")) or (
        _SAYS_WRONG.search(text) and marking in ("none", "right", "mixed")
    ):
        return Breach.VERDICT
    if any(_leaks_card(text, question) for question in facts.questions):
        return Breach.CARD
    return None
