"""What a learner writes for the course they study: the one free-text detail the apps keep and every
prompt reads, so it is made safe once, here."""

from __future__ import annotations

import re
import unicodedata

# A course keeps letters, digits, spaces and . , & / + - and nothing else: no colon, quote or bracket.
COURSE_DROPPED = re.compile(r"[^\w .,&/+-]|_")
COURSE_EDGE = " .,&/+-"
MAX_COURSE_WORDS = 12
MAX_COURSE = 80


def clean_course(text: str) -> str:
    """What a learner studies, made safe to read: normalised (so lookalike letters are the letters
    they look like), cut to a few words and a short length, and only letters, digits, spaces and a
    few marks. It never fails: what cannot stay is dropped, and a course with nothing left is empty,
    for the tutor to ask in words."""
    course = unicodedata.normalize("NFKC", str(text))
    words = COURSE_DROPPED.sub(" ", course).split()[:MAX_COURSE_WORDS]
    return " ".join(words)[:MAX_COURSE].strip(COURSE_EDGE)
