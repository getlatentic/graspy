"""Reading level of what a learner reads, measured in code: words per
sentence, syllables per word, and the share of sentences longer
than a limit. Mathematics, tables and headings are left out: they are not
prose."""

from __future__ import annotations

import re
from dataclasses import dataclass

_MATHS = re.compile(r"\\\((.*?)\\\)|\\\[(.*?)\\\]", re.DOTALL)
_CODE = re.compile(r"```.*?```", re.DOTALL)
_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_ITEM = re.compile(r"^(?:[-*•]|\d+[.)])\s+")
_MARKUP = re.compile(r"[*_`>#]|^\s*(?:[-•]|\d+[.)])\s+", re.MULTILINE)
_SENTENCE_END = re.compile(r"(?<=[.!?])[\"'”’)]*\s+")
_WORD = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:[.,]\d+)*")
_VOWELS = re.compile(r"[aeiouy]+")


def _paragraphs(markdown: str) -> list[str]:
    """Lines joined as Markdown shows them: a paragraph's lines are one
    text, and each list item is its own."""
    text = _CODE.sub(" ", markdown)
    # Inline maths reads as one word, "x"; a displayed equation is not prose.
    text = _MATHS.sub(lambda m: "x" if m.group(1) is not None else "\n\n", text)
    text = _LINK.sub(r"\1", text)
    paragraphs: list[list[str]] = [[]]
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "|")):
            paragraphs.append([])
            continue
        if _ITEM.match(stripped):
            paragraphs.append([])
        paragraphs[-1].append(_MARKUP.sub("", stripped))
    return [" ".join(lines) for lines in paragraphs if lines]


def sentences(markdown: str) -> list[list[str]]:
    """Each sentence as its words."""
    found = []
    for paragraph in _paragraphs(markdown):
        for sentence in _SENTENCE_END.split(paragraph):
            words = _WORD.findall(sentence)
            if words:
                found.append(words)
    return found


def syllables(word: str) -> int:
    lowered = word.lower()
    count = len(_VOWELS.findall(lowered))
    if lowered.endswith("e") and not lowered.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(count, 1)


@dataclass(frozen=True)
class ReadingLevel:
    sentences: int
    words_per_sentence: float
    syllables_per_word: float
    over_limit: float | None


def reading_level(texts: list[str], limit: int | None) -> ReadingLevel:
    found = [sentence for text in texts for sentence in sentences(text)]
    words = [word for sentence in found for word in sentence if not word[0].isdigit()]
    lengths = [len(sentence) for sentence in found]
    return ReadingLevel(
        sentences=len(found),
        words_per_sentence=sum(lengths) / len(found) if found else 0.0,
        syllables_per_word=sum(map(syllables, words)) / len(words) if words else 0.0,
        over_limit=(
            sum(length > limit for length in lengths) / len(found)
            if limit and found
            else None
        ),
    )
