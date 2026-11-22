r"""Maths the model wrote with no delimiters: ``\begin{pmatrix}...\end{pmatrix}``,
``A = \pi r^2``, ``\frac{d}{dx}\left[ x^2 \right] = 2x``. Each such formula is
tagged as one <latex-inline>.

Environments and braced groups are found first, by search, and stand in the text
as one private-use character each, so no scan counts their contents; one over
its cap, or that crosses a blank line, is a plain word that poisons the run
beside it. maths_reader.py reads what is left.

apps/web/src/lib/latex-runs.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re

from .maths_reader import tag_runs
from .maths_scan import MAX_DISPLAY, MAX_INLINE, Searcher, exceeds, map_unprotected
from .maths_tokens import (
    END,
    ENVIRONMENT,
    FUNCTIONS,
    GROUP,
    MARKS,
    NAMES,
    PLAIN,
    RENAMED_ENVIRONMENTS,
    UNWRAPPED_ENVIRONMENTS,
    restore,
)
from .maths_vocabulary import ENVIRONMENTS, INFIX

__all__ = [
    "FUNCTIONS",
    "INFIX",
    "NAMES",
    "RENAMED_ENVIRONMENTS",
    "UNWRAPPED_ENVIRONMENTS",
    "tag_bare_maths",
]

_BEGIN = re.compile(
    r"\\begin\{(" + "|".join(re.escape(name) for name in ENVIRONMENTS) + r")\}"
)
_BRACE = re.compile(r"\\[\s\S]|[{}]")


def _token(mark: str, store: list[str], text: str) -> str:
    store.append(text)
    return f"{mark}{len(store) - 1}{END}"


def _protect_environments(text: str, store: list[str]) -> str:
    index = Searcher(text)
    pieces, done, search = [], 0, 0
    while opener := _BEGIN.search(text, search):
        close = f"\\end{{{opener.group(1)}}}"
        end = index.find(close, opener.end(), index.paragraph_end(opener.end()))
        if end == -1:
            search = opener.end()
            continue
        stop = end + len(close)
        over = exceeds(text, opener.start(), stop, MAX_DISPLAY)
        pieces.append(text[done : opener.start()])
        pieces.append(
            _token(PLAIN if over else ENVIRONMENT, store, text[opener.start() : stop])
        )
        done = search = stop
    pieces.append(text[done:])
    return "".join(pieces)


def _outermost_groups(text: str) -> list[tuple[int, int]]:
    index = Searcher(text)
    opened, pairs = [], []
    for brace in _BRACE.finditer(text):
        if brace.group(0) == "{":
            opened.append(brace.start())
        elif brace.group(0) == "}" and opened:
            start = opened.pop()
            if index.paragraph_end(start) >= brace.end():
                pairs.append((start, brace.end()))
    groups, last_end = [], 0
    for start, end in sorted(pairs):
        if start >= last_end:
            groups.append((start, end))
            last_end = end
    return groups


def _protect_groups(text: str, store: list[str]) -> str:
    pieces, done = [], 0
    for start, end in _outermost_groups(text):
        mark = PLAIN if exceeds(text, start, end, MAX_INLINE) else GROUP
        pieces.append(text[done:start])
        pieces.append(_token(mark, store, text[start:end]))
        done = end
    pieces.append(text[done:])
    return "".join(pieces)


def _tag_segment(segment: str) -> str:
    if "\\" not in segment or re.search(MARKS, segment):
        return segment
    store: list[str] = []
    protected = _protect_groups(_protect_environments(segment, store), store)
    return restore(tag_runs(protected, lambda piece: restore(piece, store)), store)


def tag_bare_maths(text: str) -> str:
    """Each formula written with no delimiters tagged."""
    return map_unprotected(text, _tag_segment)
