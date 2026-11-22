r"""Where the code and the maths are in a reply, found in one pass.

Protected from every repair: fenced and indented code, inline code, TikZ,
maths already tagged, a span over its cap, an unclosed tag, and the pieces of a
tag a stream was cut in. Maths delimiters are found here too, so one rule says
what a span is. Nothing runs over a blank line, and each closer is searched for
within its paragraph and cap, with the answer "none from here" remembered, so
the work grows with the text and not with the text times its openers.

apps/web/src/lib/latex-scan.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re
from bisect import bisect_left
from collections.abc import Callable
from dataclasses import dataclass

# Inline maths, and display maths, a derivation of many lines.
MAX_INLINE = 3000
MAX_DISPLAY = 20000

_BLANK_LINE = re.compile(r"\n[ \t]*\r?\n")
_LIST_ITEM = re.compile(r"[ \t]*(?:[-*+]|[0-9]+[.)])[ \t]")

_TAG_PARTS = ("<latex-block>", "<latex-inline>", "</latex-block>", "</latex-inline>")
# A stream cut in the middle of a tag: every proper start of one, at the end.
_PROPER_STARTS = sorted(
    {part[:size] for part in _TAG_PARTS for size in range(1, len(part))},
    key=len,
    reverse=True,
)
_CUT_TAG = rf"(?:{'|'.join(map(re.escape, _PROPER_STARTS))})(?![\s\S])"

_OPENER = re.compile(
    r"<latex-(block|inline)>"
    r"|</latex-(?:block|inline)>"
    r"|(?:^|\n)[ ]{0,3}(?:(`{3,})[^`\n]*|(~{3,})[^\n]*)"
    r"|\\begin\{tikzpicture\}"
    # Indented code follows a blank line.
    r"|\n[ \t]*\r?\n(?: {4}|\t)"
    r"|\\\\|\\\$"
    r"|\$\$|\\\[|\\\(|\$"
    r"|`"
    rf"|{_CUT_TAG}"
)

_LENGTH_UNITS = "pt|pc|bp|dd|cc|sp|mm|cm|in|em|ex|mu|px|nd|nc"
# \[ opens display maths unless it is the length of a line break, as in
# \\[4pt]. The units are TeX's and KaTeX's.
LENGTH = rf"[ \t\r\n]*[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)[ \t\r\n]*(?:{_LENGTH_UNITS})[ \t\r\n]*\]"
_LENGTH_AT = re.compile(LENGTH)

_CLOSERS = {"$$": "$$", "\\[": "\\]", "\\(": "\\)", "$": "$"}
_WHITESPACE = " \t\r\n"


@dataclass(frozen=True)
class Span:
    """``kind`` is "code" (left as it is), "tikz" (a picture, left as it is by
    all but map_tikz), "tag" (maths already tagged),
    "display" or "inline" (a delimited span, ``inner`` between its
    delimiters), or "dollar" (an inline span written with $)."""

    start: int
    end: int
    kind: str
    inner: tuple[int, int] = (0, 0)


class Searcher:
    """Paragraph ends and closers of one text."""

    def __init__(self, text: str) -> None:
        self.text = text
        self._blanks = [blank.start() for blank in _BLANK_LINE.finditer(text)]
        self._absent: dict[str, tuple[int, int]] = {}
        self.in_list: dict[int, bool] = {}

    def paragraph_end(self, after: int) -> int:
        at = bisect_left(self._blanks, after)
        return self._blanks[at] if at < len(self._blanks) else len(self.text)

    def find(self, closer: str, after: int, limit: int) -> int:
        """Where the closer is in [after, limit), or -1."""
        known = self._absent.get(closer)
        if known and known[0] <= after and limit <= known[1]:
            return -1
        end = self.text.find(closer, after, limit)
        if end == -1:
            self._absent[closer] = (after, limit)
        return end


def _fence_end(text: Searcher, opener: re.Match) -> int:
    run = opener.group(2) or opener.group(3)
    closing = re.compile(
        rf"\n {{0,3}}{re.escape(run[0])}{{{len(run)},}}[ \t]*\r?(?=\n|(?![\s\S]))"
    )
    found = closing.search(text.text, opener.end())
    # An unclosed fence is a block still being written: code to the end.
    return len(text.text) if found is None else found.end()


def _block_start(text: str, end: int) -> int:
    """Where the paragraph whose last line ends at ``end`` begins."""
    start, cursor = end, end
    for _ in range(200):
        line_start = text.rfind("\n", 0, cursor) + 1
        if not text[line_start:cursor].strip():
            break
        start = line_start
        if line_start == 0:
            break
        cursor = line_start - 1
    return start


def _previous_block_end(text: str, start: int) -> int:
    """Where the last line of the paragraph before the one at ``start`` ends,
    or -1."""
    cursor = start - 1
    while cursor > 0:
        line_start = text.rfind("\n", 0, cursor) + 1
        if text[line_start:cursor].strip():
            return cursor
        cursor = line_start - 1
    return -1


def _preceded_by_list_item(index: Searcher, blank: int) -> bool:
    """Whether the paragraph before the blank line at ``blank`` is a list item,
    or the indented continuation of one: an indent after it is a paragraph of
    the item, not code. Each paragraph is decided once."""
    text, chain, end, result = index.text, [], blank, False
    while True:
        start = _block_start(text, end)
        if start == end:
            break
        if start in index.in_list:
            result = index.in_list[start]
            break
        chain.append(start)
        line_end = text.find("\n", start, end)
        first = text[start : end if line_end == -1 else line_end]
        if _LIST_ITEM.match(first):
            result = True
            break
        if not first.startswith((" ", "\t")):
            break
        end = _previous_block_end(text, start)
        if end < 0:
            break
    for start in chain:
        index.in_list[start] = result
    return result


def _indented_end(text: str, after: int) -> int:
    line_end = text.find("\n", after)
    while line_end != -1 and text.startswith(("    ", "\t"), line_end + 1):
        line_end = text.find("\n", line_end + 1)
    return len(text) if line_end == -1 else line_end


def _delimited(text: Searcher, opener: str, start: int) -> Span | None:
    """The span the delimiter opens: None when it opens none, "code" when it
    is longer than its cap, which is then left exactly as it was."""
    after = start + len(opener)
    if opener == "\\[" and _LENGTH_AT.match(text.text, after):
        return None
    closer = _CLOSERS[opener]
    end = text.find(closer, after, text.paragraph_end(after))
    if end == -1:
        return None
    display = opener in ("$$", "\\[")
    stop = end + len(closer)
    if end - after > (MAX_DISPLAY if display else MAX_INLINE):
        return Span(start, stop, "code")
    if opener == "$":
        # Money in a word problem is two dollar signs in one sentence, so a
        # bare pair is not enough to mean maths: the span must not open or
        # close on whitespace, and a digit after the closing $ means it was a
        # price.
        maths = text.text[after:end]
        if not maths or maths[0] in _WHITESPACE or maths[-1] in _WHITESPACE:
            return None
        following = text.text[end + 1 : end + 2]
        if following and "0" <= following <= "9":
            return None
    kind = "display" if display else "dollar" if opener == "$" else "inline"
    return Span(start, stop, kind, (after, end))


def _tag_span(text: Searcher, opener: re.Match) -> Span:
    close = f"</latex-{opener.group(1)}>"
    after, limit = opener.end(), text.paragraph_end(opener.end())
    end = text.find(close, after, limit)
    if end == -1:
        # An unclosed tag: the maths is still being written.
        return Span(opener.start(), limit, "code")
    cap = MAX_DISPLAY if opener.group(1) == "block" else MAX_INLINE
    stop = end + len(close)
    if end - after > cap:
        return Span(opener.start(), stop, "code")
    return Span(opener.start(), stop, "tag", (after, end))


def _span_at(text: Searcher, opener: re.Match, indented: bool) -> Span | None:
    source = opener.group(0)
    if opener.group(1):
        return _tag_span(text, opener)
    if source.startswith("<"):
        return Span(opener.start(), opener.end(), "code")
    if opener.group(2) or opener.group(3):
        return Span(opener.start(), _fence_end(text, opener), "code")
    if source.startswith("\n"):
        if not indented or _preceded_by_list_item(text, opener.start()):
            return None
        return Span(opener.start(), _indented_end(text.text, opener.end()), "code")
    if source.startswith("\\begin"):
        close = "\\end{tikzpicture}"
        end = text.find(close, opener.end(), len(text.text))
        return None if end == -1 else Span(opener.start(), end + len(close), "tikz")
    if source == "`":
        end = text.text.find("`", opener.end())
        if end == -1 or text.text.find("\n", opener.end(), end) != -1:
            return None
        return Span(opener.start(), end + 1, "code")
    return _delimited(text, source, opener.start())


def scan(text: str, *, indented: bool = True) -> list[Span]:
    """The spans of the text, in order. The restore of a tab the JSON turned
    into a control character passes ``indented=False``."""
    found, search, prepared = [], 0, Searcher(text)
    while opener := _OPENER.search(text, search):
        source = opener.group(0)
        if source in ("\\\\", "\\$"):
            search = opener.end()
            continue
        span = _span_at(prepared, opener, indented)
        if span is None:
            search = opener.start() + 1 if source[0] in "$\\`" else opener.end()
            continue
        found.append(span)
        search = span.end
    return found


def map_unprotected(
    text: str,
    rewrite: Callable[[str], str],
    *,
    indented: bool = True,
    in_maths: bool = False,
) -> str:
    """The text with ``rewrite`` applied to everything outside the spans, and
    outside the maths in them unless ``in_maths`` says to rewrite that too."""
    pieces, done = [], 0
    for span in scan(text, indented=indented):
        if in_maths and span.kind in ("display", "inline", "dollar", "tag"):
            continue
        pieces.append(rewrite(text[done : span.start]))
        pieces.append(text[span.start : span.end])
        done = span.end
    pieces.append(rewrite(text[done:]))
    return "".join(pieces)


def map_maths(text: str, rewrite: Callable[[str], str]) -> str:
    """The text with ``rewrite`` applied to the inside of each tagged or
    dollar-delimited span."""
    pieces, done = [], 0
    for span in scan(text):
        if span.kind in ("tag", "dollar"):
            pieces.append(text[done : span.inner[0]])
            pieces.append(rewrite(text[span.inner[0] : span.inner[1]]))
            done = span.inner[1]
    pieces.append(text[done:])
    return "".join(pieces)


def map_tikz(text: str, rewrite: Callable[[str], str]) -> str:
    """The text with ``rewrite`` applied to each TikZ picture outside code."""
    pieces, done = [], 0
    for span in scan(text):
        if span.kind == "tikz":
            pieces.append(text[done : span.start])
            pieces.append(rewrite(text[span.start : span.end]))
            done = span.end
    pieces.append(text[done:])
    return "".join(pieces)


def tag_delimiters(text: str, *, dollars: bool) -> str:
    """Every maths delimiter made a tag; a $ pair only when ``dollars`` says so."""
    pieces, done = [], 0
    for span in scan(text):
        if span.kind not in ("display", "inline") and not (
            span.kind == "dollar" and dollars
        ):
            continue
        tag = "block" if span.kind == "display" else "inline"
        pieces.append(text[done : span.start])
        pieces.append(
            f"<latex-{tag}>{text[span.inner[0] : span.inner[1]]}</latex-{tag}>"
        )
        done = span.end
    pieces.append(text[done:])
    return "".join(pieces)


def tags_as_dollars(text: str) -> str:
    """Each tagged span written with $ or $$; an unclosed tag is left alone."""
    pieces, done = [], 0
    for span in scan(text):
        if span.kind != "tag":
            continue
        mark = "$$" if text.startswith("<latex-block>", span.start) else "$"
        pieces.append(text[done : span.start])
        pieces.append(f"{mark}{text[span.inner[0] : span.inner[1]]}{mark}")
        done = span.end
    pieces.append(text[done:])
    return "".join(pieces)
