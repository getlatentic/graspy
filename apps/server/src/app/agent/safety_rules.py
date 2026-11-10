"""What a reply to a child must never carry, read from its words: abuse,
a way to reach the tutor outside the app, a request for the learner's personal
details, and a personal detail the tutor was never given. The meaning of a
sentence is for the judge (safety_judge.py); these are the patterns that need no
model and cost no time."""

from __future__ import annotations

import re
from enum import Enum


class Unsafe(Enum):
    ABUSE = "abuse"
    CONTACT = "contact"
    ASKS_PERSONAL = "asks_personal"
    INVENTS_PERSONAL = "invents_personal"


# Words no school answer needs, in English. The mild ones ("damn", "stupid") are not here:
# a lesson on language may quote them, and an insult is read by the judge.
_ABUSE = re.compile(
    r"\b(?:fuck\w*|shit\w*|bitch\w*|assholes?|cunts?|dickheads?|pussy|slut\w*"
    r"|motherfuck\w*|nigg(?:a|er)s?|idiots?|morons?|imbeciles?|retard(?:s|ed)?)\b",
    re.IGNORECASE,
)

_PLATFORM = (
    r"(?:whatsapp|telegram|snapchat|instagram|tiktok|facebook|discord|signal|messenger)"
)
# The tutor inviting the child to reach it outside the app. A link, an email address or a phone
# number is the judge's to read: a lesson on a CV or a letter shows made-up ones.
_CONTACT = re.compile(
    r"\bt\.me/|\bwa\.me/|\bbit\.ly/"
    r"|\b(?:add|dm|follow)\s+me\b"
    rf"|\b(?:my|our)\s+{_PLATFORM}\b",
    re.IGNORECASE,
)

_NEGATED = re.compile(
    r"\b(?:never|not|don't|do not|dont|cannot|can't|must not|mustn't|avoid|without|why|before you|ask (?:a|an|your) (?:grown-up|adult|parent|teacher))\b",
    re.IGNORECASE,
)
_DETAIL = (
    r"(?:(?:home|house|full|real|first|last|sur|e-?mail|phone|mobile|school|parents?'?s?)\s*)*"
    r"(?:addresses|address|names?|phone numbers?|numbers?|emails?|passwords?|pins?|birthdays?|birth dates?|ages?"
    r"|schools?|classroom|class teacher|passcode|location|surname)"
)
# A question or request to the learner, in the tutor's own voice, that a personal detail answers.
# "Type your full name" under a letter is an instruction for the letter, which the judge reads.
_ASKS = re.compile(
    rf"\b(?:what(?:'s|\s+is|\s+are)|tell me|give me|send me)\s+(?:me\s+)?(?:your|the name of your)\s+{_DETAIL}"
    r"|\bwhere (?:do|does) you(?:r \w+)? live\b|\bwhich (?:street|town|area|school|church|mosque)\b[^.?!]*\b(?:you|your)\b"
    r"|\bhow old are you\b|\bwhen (?:is|was) your birthday\b|\bwhat(?:'s|\s+is)\s+your\s+(?:mother|father|mum|dad|parents?)'?s?\s+name"
    r"|\b(?:send|share|show|give)\s+(?:me\s+)?(?:a\s+|your\s+)?(?:photos?|pictures?|pics?|selfies?|videos?)\s+of\s+(?:you|yourself)"
    r"|\bwhat are your parents'?\s+names|\bwhere do your (?:parents|mother|father)\b",
    re.IGNORECASE,
)

_NAME = r"(?:[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3})"
_CLAIMS = (
    re.compile(rf"(?i:\byour\s+(?:full\s+|real\s+)?name\s+is\s+)(?P<v>{_NAME})"),
    # A place the tutor says the child lives in; "if you live in a rural area" is a condition.
    re.compile(
        r"(?<!\bif )(?<!\bwhen )(?<!\bwhere )(?<!\bwhether )(?<!\bunless )(?i:\byou\s+live\s+(?:at|in|on|near)\s+)(?P<v>(?:[A-Z]|\d)[^,.;!?]*)"
    ),
    re.compile(rf"(?i:\byou\s+(?:go|attend|study)\s+(?:to|at)\s+)(?P<v>{_NAME})"),
    re.compile(
        rf"(?i:\byour\s+(?:school|class teacher|teacher|neighbourhood|street|house|town)\s+(?:is|are|called)\s+)(?P<v>{_NAME})"
    ),
    re.compile(
        r"(?i:\byour\s+(?:mother|father|mum|mummy|dad|daddy|parents?|brother|sister|uncle|aunt|guardian)(?:'s)?"
        rf"(?:\s+name)?(?:\s+is|,)?\s+)(?P<v>(?:Mrs?|Mr|Dr|Chief|Madam|Alhaji|Alhaja)\.?\s+{_NAME})"
    ),
    re.compile(
        r"\byour\s+(?:phone|mobile|telephone)\s+number\s+is\s+(?P<v>[\d+][\d\s-]+)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\byour\s+(?:birthday|date of birth)\s+(?:is|was)\s+(?:on\s+|in\s+)?(?P<v>\w+(?:\s+\d+)?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:you(?:'re| are)|as)\s+an?\s+(?P<v>\w+)[ -]years?[ -]old\b"
        r"|\byou(?:'re| are)\s+(?P<v2>\d{1,2})\b(?!\s*(?:%|percent|marks))",
        re.IGNORECASE,
    ),
    re.compile(
        r"\byour\s+(?:parents|mother|father|mum|dad)\s+(?P<v>(?:drinks?|smokes?|beats?|fights?|works?|divorced)\b[^,.;!?]*)",
        re.IGNORECASE,
    ),
)
_TOKEN = re.compile(r"[\w']+")


def _is_known(value: str, known: str) -> bool:
    """A value the learner or the app already gave is not invented: every word of it is in what is known."""
    words = _TOKEN.findall(value.lower())
    heard = set(_TOKEN.findall(known.lower()))
    return bool(words) and all(word in heard for word in words)


def _invents(sentence: str, known: str) -> bool:
    for claim in _CLAIMS:
        for found in claim.finditer(sentence):
            value = next((v for v in found.groupdict().values() if v), "")
            if not _is_known(value, known):
                return True
    return False


def unsafe_in(sentence: str, known: str) -> Unsafe | None:
    """The first reason the sentence may not be sent, if any. `known` is every
    word the learner or the app has given this turn: a detail written there is
    not invented."""
    if _ABUSE.search(sentence):
        return Unsafe.ABUSE
    if _CONTACT.search(sentence):
        return Unsafe.CONTACT
    if _ASKS.search(sentence) and not _NEGATED.search(sentence):
        return Unsafe.ASKS_PERSONAL
    if _invents(sentence, known):
        return Unsafe.INVENTS_PERSONAL
    return None
