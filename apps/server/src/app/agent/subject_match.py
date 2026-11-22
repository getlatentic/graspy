"""Which of the learner's subjects a name means. Conservative by design: a wrong
duplicate is recoverable and a wrong removal is not. A name is a subject of
theirs only when it is the same name once normalised, or a short abbreviation of
one they hold. A full name matches only itself, so "English Language" never
means "English Literature", and a misspelling is a new subject: forgiving slips
would make "Macroeconomics" and "Microeconomics" one."""

from __future__ import annotations

import unicodedata
from bisect import bisect_right

from .latin_ranges import LATIN_RANGES

# Compared at this length, so a huge name costs the same as a long one.
MAX_NAME = 80
# What is decomposed of a name: enough that no character past it could reach the first
# MAX_NAME (a character decomposes into at most 18), so the cost does not grow with the name.
DECOMPOSED = MAX_NAME * 18
# Letters with no decomposition into a base letter and marks.
LETTERS = {
    "ø": "o",
    "ł": "l",
    "ı": "i",
    "đ": "d",
    "ð": "d",
    "þ": "th",
    "æ": "ae",
    "œ": "oe",
    "ß": "ss",
}
# Short forms, as their normalised keys, and the full names they stand for.
ABBREVIATIONS = {
    "maths": ("mathematics",),
    "math": ("mathematics",),
    "furthermaths": ("furthermathematics",),
    "pe": ("physicaleducation",),
    "re": ("religiouseducation",),
    "bio": ("biology",),
    "chem": ("chemistry",),
    "phys": ("physics",),
    "phy": ("physics",),
    "geo": ("geography",),
    "hist": ("history",),
}
# "English" alone stands for whichever English subject they hold, if one.
ENGLISH = frozenset({"eng", "english"})
LATIN_STARTS = [start for start, _ in LATIN_RANGES]


def _is_latin(char: str) -> bool:
    at = bisect_right(LATIN_STARTS, ord(char)) - 1
    return at >= 0 and ord(char) <= LATIN_RANGES[at][1]


def normalise(name: str) -> str:
    """The name as it is compared: lower case, accents of Latin letters folded,
    and no spaces or punctuation, so "Pre-calculus" is "Precalculus". The marks
    of other scripts are part of their letters and stay. web's nameKey is the
    same function, and web/src/features/learn/lib/name-key-corpus.json shares their cases."""
    key: list[str] = []
    latin = False
    # Decomposed first, so "ＭＡＴＨＳ" and "𝐌𝐚𝐭𝐡𝐬" are lower-cased as the letters they are, and cut after.
    decomposed = unicodedata.normalize("NFKD", name[:DECOMPOSED]).lower()
    for char in decomposed[:MAX_NAME]:
        category = unicodedata.category(char)[0]
        if category == "M":
            if not latin:
                key.append(char)
        elif category in "LN":
            latin = _is_latin(char)
            key.append(LETTERS.get(char, char))
        else:
            latin = False
    return "".join(key)


def candidates(wanted: str, names: list[str]) -> list[int]:
    """Every held name `wanted` could mean: those it equals once normalised, or
    else those its abbreviation stands for. More than one is an ambiguity for the
    caller to put to the learner."""
    target = normalise(wanted)
    if not target:
        return []
    held = [normalise(name) for name in names]
    equal = [i for i, name in enumerate(held) if name == target]
    if equal:
        return equal
    if target in ABBREVIATIONS:
        full = ABBREVIATIONS[target]
        return [i for i, name in enumerate(held) if name in full]
    if target in ENGLISH:
        return [i for i, name in enumerate(held) if name.startswith("english")]
    return []
