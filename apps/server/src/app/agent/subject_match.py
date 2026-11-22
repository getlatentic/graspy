"""Whether a name the learner gives is one of their subjects. Adding and removing
use it alike, so a subject that cannot be added again as a new one can be found
to be dropped."""

from __future__ import annotations

import difflib
import re

# How alike two names of the same shape must be to count as one spelled badly.
TYPO_CUTOFF = 0.85
# Longer names are their own subjects: a name of more words that merely holds
# a subject's name, "Mathematics of machine learning", is not that subject.
SHORT_NAME_WORDS = 2
MIN_STEM = 3
MIN_TAIL = 3
ROMAN_LEVELS = frozenset({"i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"})


def _words(name: str) -> list[str]:
    return re.findall(r"[^\W_]+", name.casefold())


def _without_level(words: list[str]) -> tuple[list[str], str | None]:
    """A closing number or Roman numeral names another course: "Physics 2"."""
    if len(words) > 1 and (words[-1].isdigit() or words[-1] in ROMAN_LEVELS):
        return words[:-1], words[-1]
    return words, None


def _abbreviates(short: str, word: str) -> bool:
    """ "maths" and "math" for "mathematics", never "physics" for "physical"."""
    if short == word:
        return True
    stem = short.removesuffix("s")
    return (
        len(stem) >= MIN_STEM
        and word.startswith(stem)
        and len(word) - len(stem) >= MIN_TAIL
    )


def _same_words(wanted: list[str], held: list[str]) -> bool:
    if wanted == held:
        return True
    if len(wanted) == len(held):
        alike = difflib.SequenceMatcher(None, " ".join(wanted), " ".join(held))
        return alike.ratio() >= TYPO_CUTOFF or (
            len(wanted) == 1
            and (_abbreviates(wanted[0], held[0]) or _abbreviates(held[0], wanted[0]))
        )
    short, long = sorted((wanted, held), key=len)
    return (
        len(short) == 1
        and len(long) <= SHORT_NAME_WORDS
        and any(_abbreviates(short[0], word) for word in long)
    )


def same_subject(wanted: str, held: str) -> bool:
    words, level = _without_level(_words(wanted))
    held_words, held_level = _without_level(_words(held))
    if not words or not held_words or level != held_level:
        return False
    return _same_words(words, held_words)


def find_subject(wanted: str, names: list[str]) -> int | None:
    """The index of the name that is the subject `wanted` names, the exactly
    spelled one first."""
    folded = " ".join(_words(wanted))
    for index, name in enumerate(names):
        if folded and folded == " ".join(_words(name)):
            return index
    return next(
        (index for index, name in enumerate(names) if same_subject(wanted, name)),
        None,
    )
