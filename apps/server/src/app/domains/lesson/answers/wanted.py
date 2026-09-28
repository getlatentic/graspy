"""The form a question asks its answer in: "as a decimal", "which fraction",
"in its lowest terms". A form word that only names the number given ("the
fraction 7/8") asks nothing; one that could be either makes the question
unreadable, as two different forms asked for do."""

from __future__ import annotations

from dataclasses import dataclass

from .spans import SPAN
from .tokens import Form
from .units import Unit


@dataclass(frozen=True)
class Wanted:
    form: Form | None = None
    improper: bool = False
    lowest: bool = False
    unit: Unit | None = None

    def describe(self) -> str:
        parts = []
        if self.form:
            kind = "an improper fraction" if self.improper else f"a {self.form}"
            parts.append(f"as {kind}")
        if self.lowest:
            parts.append("in its lowest terms")
        if self.unit:
            parts.append(f"in {self.unit.name}")
        return " ".join(parts)


_PAIRS = {
    ("mixed", "number"): "mixed number",
    ("mixed", "numbers"): "mixed number",
    ("mixed", "fraction"): "mixed number",
    ("improper", "fraction"): "improper fraction",
    ("improper", "fractions"): "improper fraction",
    ("whole", "number"): "whole number",
    ("whole", "numbers"): "whole number",
    ("per", "cent"): "percent",
}
_FORMS: dict[str, tuple[Form, bool]] = {
    "decimal": (Form.DECIMAL, False),
    "decimals": (Form.DECIMAL, False),
    "fraction": (Form.FRACTION, False),
    "fractions": (Form.FRACTION, False),
    "improper fraction": (Form.FRACTION, True),
    "mixed number": (Form.MIXED, False),
    "percentage": (Form.PERCENT, False),
    "percentages": (Form.PERCENT, False),
    "percent": (Form.PERCENT, False),
    "whole number": (Form.WHOLE, False),
}
_LOWEST = frozenset(
    {"simplest", "lowest", "simplify", "simplified", "simplifying", "reduce"}
)
_INTO = frozenset({"as", "to", "into", "in"})
_ARTICLES = frozenset({"a", "an", "its"})
_ASKING = frozenset({"which", "what", "following", "these"})
_AFTER = frozenset({"form", "equivalent", "for", "of"})


class Unreadable(ValueError):
    pass


def _paired(words: list[str]) -> list[str]:
    paired: list[str] = []
    for word in words:
        pair = _PAIRS.get((paired[-1], word)) if paired else None
        if pair:
            paired[-1] = pair
        else:
            paired.append(word)
    return paired


def _asks(words: list[str], at: int) -> bool | None:
    """Whether the form word at ``at`` asks for its form, names the number
    given, or (None) cannot be told."""
    before = words[at - 1] if at else ""
    earlier = words[at - 2] if at > 1 else ""
    after = words[at + 1] if at + 1 < len(words) else ""
    if before in _INTO or (before in _ARTICLES and earlier in _INTO):
        return True
    if before in _ASKING or after in _AFTER:
        return True
    if after == SPAN:
        return False
    return None


def wanted(words: list[str], unit: Unit | None = None) -> Wanted:
    """Raises Unreadable when the form asked for cannot be told."""
    words = _paired(words)
    asked: set[tuple[Form, bool]] = set()
    for at, word in enumerate(words):
        if word not in _FORMS:
            continue
        asks = _asks(words, at)
        if asks is None:
            raise Unreadable(f"cannot tell what {word!r} asks")
        if asks:
            asked.add(_FORMS[word])
    if len(asked) > 1:
        raise Unreadable("two forms asked for")
    form, improper = asked.pop() if asked else (None, False)
    lowest = any(word in _LOWEST for word in words)
    return Wanted(form, improper, lowest, unit)
