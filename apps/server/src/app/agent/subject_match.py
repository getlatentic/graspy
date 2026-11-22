"""Which of the learner's subjects a name means. Conservative by design: a wrong
duplicate is recoverable and a wrong removal is not, so a name is a subject of
theirs only when it is the same name once normalised, an everyday abbreviation
of one they hold, or a long single word with a slip in it. Anything else is
another subject, and a name that could mean two held subjects means neither."""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass

# Compared at this length, so a huge name costs the same as a long one.
MAX_NAME = 80
# A typo is forgiven only in one long word, and only when nearly all of it is kept.
MIN_TYPO_LETTERS = 8
TYPO_CUTOFF = 0.92


@dataclass(frozen=True)
class Abbreviations:
    """Forms of one subject's name. `family`, for a subject with many kinds such
    as English, also lets the word alone mean any held name that starts with it."""

    forms: frozenset[str]
    family: str | None = None

    def covers(self, name: str) -> bool:
        return name in self.forms or (
            self.family is not None and name.startswith(f"{self.family} ")
        )


ABBREVIATIONS = (
    Abbreviations(frozenset({"maths", "math", "mathematics"})),
    Abbreviations(frozenset({"eng", "english", "english language"}), family="english"),
    Abbreviations(
        frozenset(
            {
                "ict",
                "computing",
                "computer science",
                "computer studies",
                "information and communication technology",
            }
        )
    ),
    Abbreviations(frozenset({"pe", "p e", "physical education"})),
    Abbreviations(frozenset({"re", "r e", "religious education", "religious studies"})),
    Abbreviations(frozenset({"bio", "biology"})),
    Abbreviations(frozenset({"chem", "chemistry"})),
    Abbreviations(frozenset({"phy", "phys", "physics"})),
    Abbreviations(frozenset({"geo", "geography"})),
    Abbreviations(frozenset({"hist", "history"})),
)


def normalise(name: str) -> str:
    """Lower case, accents folded, one space between words, no punctuation."""
    folded = unicodedata.normalize("NFKD", name[:MAX_NAME]).casefold()
    unmarked = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(re.findall(r"[^\W_]+", unmarked))


def _is_typo(wanted: str, held: str) -> bool:
    if " " in wanted or " " in held:
        return False
    if min(len(wanted), len(held)) < MIN_TYPO_LETTERS:
        return False
    if any(c.isdigit() for c in wanted + held):
        return False
    if wanted.startswith(held) or held.startswith(wanted):
        return False
    if wanted.endswith(held) or held.endswith(wanted):
        return False
    return difflib.SequenceMatcher(None, wanted, held).ratio() >= TYPO_CUTOFF


def candidates(wanted: str, names: list[str]) -> list[int]:
    """Every held name `wanted` could mean: the ones it equals once normalised, or
    else the ones an abbreviation covers, or else the ones it is a slip of. More
    than one is an ambiguity for the caller to put to the learner."""
    target = normalise(wanted)
    if not target:
        return []
    held = [normalise(name) for name in names]
    equal = [i for i, name in enumerate(held) if name == target]
    if equal:
        return equal
    for group in ABBREVIATIONS:
        if target in group.forms:
            covered = [i for i, name in enumerate(held) if group.covers(name)]
            if covered:
                return covered
    return [i for i, name in enumerate(held) if _is_typo(target, name)]
