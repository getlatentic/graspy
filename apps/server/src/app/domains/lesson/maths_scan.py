r"""Where the code and the maths are in a reply, found in one pass.

Protected from every repair: fenced and indented code, inline code, TikZ, HTML
pre and code, a link's address and a bare URL, maths already tagged, a span over
its cap, an unclosed tag, and the pieces of a tag a stream was cut in. Maths
delimiters are found here too, so one rule says what a span is. Nothing runs
over a blank line, and each closer is searched for within its paragraph and
cap, with the answer "none from here" remembered, so the work grows with the
text and not with the text times its openers.

apps/web/src/lib/latex-scan.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re
from bisect import bisect_left
from collections.abc import Callable
from dataclasses import dataclass

from .maths_display import display_layout
from .maths_layout import indented_end, preceded_by_list_item

# Inline maths, and display maths, a derivation of many lines.
MAX_INLINE = 3000
MAX_DISPLAY = 20000

_BLANK_LINE = re.compile(r"\n[ \t]*\r?\n")

_TAG_PARTS = ("<latex-block>", "<latex-inline>", "</latex-block>", "</latex-inline>")
# A stream cut in the middle of a tag: every proper start of one, at the end.
_PROPER_STARTS = sorted(
    {part[:size] for part in _TAG_PARTS for size in range(1, len(part))},
    key=len,
    reverse=True,
)
_CUT_TAG = rf"(?:{'|'.join(map(re.escape, _PROPER_STARTS))})(?![\s\S])"

# A fence may sit in a block quote or be indented within a list item, so what
# comes before it on its line is any run of `>` and spaces.
_FENCE_LINE = r"(?:[ \t]*>)*[ \t]*"
_OPENER = re.compile(
    r"<latex-(block|inline)>"
    r"|</latex-(?:block|inline)>"
    rf"|(?:^|\n){_FENCE_LINE}(?:(`{{3,}})[^`\n]*|(~{{3,}})[^\n]*)"
    r"|<(pre|code)(?![A-Za-z0-9])[^>\n]*>"
    r"|\\begin\{tikzpicture\}"
    # Indented code follows a blank line, and is not an indented fence.
    rf"|(\n[ \t]*\r?\n(?![ \t]*(?:`{{3,}}|~{{3,}}))(?: {{4}}|\t))"
    # It may also follow a heading.
    r"|((?:^|\n)[ ]{0,3}\#{1,6}(?:[ \t][^\n]*)?\n(?: {4}|\t))"
    r"|https?://[^\s<>)\]]+"
    r"|\]\([^()\s]*\)"
    r"|\\\\|\\\$"
    r"|\$\$|\\\[|\\\(|\$"
    r"|(`+)"
    rf"|{_CUT_TAG}"
)
_TAG, _FENCE_BACKTICKS, _FENCE_TILDES, _HTML, _INDENT, _HEADING_INDENT, _CODE_RUN = (
    1,
    2,
    3,
    4,
    5,
    6,
    7,
)

_LENGTH_UNITS = "pt|pc|bp|dd|cc|sp|mm|cm|in|em|ex|mu|px|nd|nc"
# \[ opens display maths unless it is the length of a line break, as in
# \\[4pt]. The units are TeX's and KaTeX's.
LENGTH = rf"[ \t\r\n]*[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)[ \t\r\n]*(?:{_LENGTH_UNITS})[ \t\r\n]*\]"
_LENGTH_AT = re.compile(LENGTH)

_CLOSERS = {"$$": "$$", "\\[": "\\]", "\\(": "\\)", "$": "$"}
_WHITESPACE = " \t\r\n"


def exceeds(text: str, start: int, end: int, cap: int) -> bool:
    """Whether text[start:end] is longer than ``cap`` UTF-16 units, as a
    string of the web is measured."""
    count = end - start
    if count > cap:
        return True
    if count * 2 <= cap:
        return False
    return len(text[start:end].encode("utf-16-le")) // 2 > cap


@dataclass(frozen=True)
class Span:
    """``kind`` is "code" (left as it is), "tikz" (a picture, left as it is by
    all but map_tikz), "tag" (maths already tagged), "display" or "inline" (a
    delimited span, ``inner`` between its delimiters), or "dollar" (an inline
    span written with $)."""

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

    def find_unescaped(self, closer: str, after: int, limit: int) -> int:
        """As find, passing over a closer a backslash escapes."""
        end = self.find(closer, after, limit)
        while end != -1 and is_escaped(self.text, end):
            end = self.find(closer, end + 1, limit)
        return end


def is_escaped(text: str, position: int) -> bool:
    """Whether an odd number of backslashes come right before the position."""
    count = 0
    while position - count > 0 and text[position - count - 1] == "\\":
        count += 1
    return count % 2 == 1


def _fence_end(text: Searcher, opener: re.Match) -> int:
    run = opener.group(_FENCE_BACKTICKS) or opener.group(_FENCE_TILDES)
    closing = re.compile(
        rf"\n{_FENCE_LINE}{re.escape(run[0])}{{{len(run)},}}[ \t]*\r?(?=\n|(?![\s\S]))"
    )
    found = closing.search(text.text, opener.end())
    # An unclosed fence is a block still being written: code to the end.
    return len(text.text) if found is None else found.end()


def _code_span_end(text: Searcher, opener: re.Match) -> int | None:
    """The end of the code span a run of backticks opens: the next run of as
    many, in the same paragraph."""
    run = opener.group(_CODE_RUN)
    limit = text.paragraph_end(opener.end())
    at = text.find(run, opener.end(), limit)
    while at != -1 and text.text[at + len(run) : at + len(run) + 1] == "`":
        while text.text[at : at + 1] == "`":
            at += 1
        at = text.find(run, at, limit)
    return None if at == -1 else at + len(run)


def _delimited(text: Searcher, opener: str, start: int) -> Span | None:
    """The span the delimiter opens: None when it opens none, "code" when it
    is longer than its cap, which is then left exactly as it was."""
    after = start + len(opener)
    if opener == "\\[" and _LENGTH_AT.match(text.text, after):
        return None
    closer = _CLOSERS[opener]
    limit = text.paragraph_end(after)
    end = text.find_unescaped(closer, after, limit)
    if end == -1:
        return None
    display = opener in ("$$", "\\[")
    stop = end + len(closer)
    if exceeds(text.text, after, end, MAX_DISPLAY if display else MAX_INLINE):
        return Span(start, stop, "code")
    if opener == "$":
        # Money in a word problem is two dollar signs in one sentence, so a
        # bare pair is not enough to mean maths: the span must not open or
        # close on whitespace, and one that opens on a digit and is followed by
        # another is a price.
        maths = text.text[after:end]
        if not maths or maths[0] in _WHITESPACE or maths[-1] in _WHITESPACE:
            return None
        following = text.text[end + 1 : end + 2]
        if "0" <= maths[0] <= "9" and following and "0" <= following <= "9":
            return None
    kind = "display" if display else "dollar" if opener == "$" else "inline"
    return Span(start, stop, kind, (after, end))


def _tag_span(text: Searcher, opener: re.Match) -> Span:
    close = f"</latex-{opener.group(_TAG)}>"
    after, limit = opener.end(), text.paragraph_end(opener.end())
    end = text.find(close, after, limit)
    if end == -1:
        # An unclosed tag: the maths is still being written.
        return Span(opener.start(), limit, "code")
    cap = MAX_DISPLAY if opener.group(_TAG) == "block" else MAX_INLINE
    stop = end + len(close)
    if exceeds(text.text, after, end, cap):
        return Span(opener.start(), stop, "code")
    return Span(opener.start(), stop, "tag", (after, end))


def _indented(text: Searcher, opener: re.Match, indented: bool) -> Span | None:
    if not indented:
        return None
    if opener.group(_INDENT):
        if preceded_by_list_item(text.text, opener.start(), text.in_list):
            return None
        return Span(opener.start(), indented_end(text.text, opener.end()), "code")
    # After a heading: the code begins on the line that follows it.
    newline = opener.end() - (1 if opener.group(0).endswith("\t") else 4) - 1
    return Span(newline, indented_end(text.text, opener.end()), "code")


def _span_at(text: Searcher, opener: re.Match, indented: bool) -> Span | None:
    source = opener.group(0)
    if opener.group(_TAG):
        return _tag_span(text, opener)
    if source.startswith("<") and not opener.group(_HTML):
        return Span(opener.start(), opener.end(), "code")
    if opener.group(_FENCE_BACKTICKS) or opener.group(_FENCE_TILDES):
        return Span(opener.start(), _fence_end(text, opener), "code")
    if opener.group(_HTML):
        close = f"</{opener.group(_HTML)}>"
        end = text.find(close, opener.end(), len(text.text))
        return None if end == -1 else Span(opener.start(), end + len(close), "code")
    if opener.group(_INDENT) or opener.group(_HEADING_INDENT):
        return _indented(text, opener, indented)
    if source.startswith("\\begin"):
        close = "\\end{tikzpicture}"
        end = text.find(close, opener.end(), len(text.text))
        return None if end == -1 else Span(opener.start(), end + len(close), "tikz")
    if opener.group(_CODE_RUN):
        end = _code_span_end(text, opener)
        return None if end is None else Span(opener.start(), end, "code")
    if source.startswith(("http", "](")):
        return Span(opener.start(), opener.end(), "code")
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
            retry = source[0] in "$\\" and not opener.group(_CODE_RUN)
            search = opener.start() + 1 if retry else opener.end()
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


def _dollars_for(maths: str, block: bool, following: str) -> tuple[str, str]:
    """The text a tagged span is written as: $ pairs that open and close on
    text. A pair that opens on a digit and is followed by one would be read as a
    price, so it is written with $$."""
    if block:
        return "$$", maths
    maths = maths.strip(_WHITESPACE)
    if not maths:
        return "", maths
    price = (
        "0" <= maths[0] <= "9" and following[:1] != "" and "0" <= following[:1] <= "9"
    )
    return ("$$" if price else "$"), maths


def tags_as_dollars(text: str) -> str:
    """Each tagged span written with $ or $$; an unclosed tag is left alone."""
    pieces, done, carry = [], 0, None
    for span in scan(text):
        if span.kind != "tag":
            continue
        block = text.startswith("<latex-block>", span.start)
        mark, maths = _dollars_for(
            text[span.inner[0] : span.inner[1]], block, text[span.end : span.end + 1]
        )
        inherited = carry if done == span.start else None
        carry = None
        pieces.append(text[done : span.start])
        written, done = f"{mark}{maths}{mark}", span.end
        if block and "\n" in maths:
            layout = display_layout(text, span.start, span.end, maths, inherited)
            if layout:
                trailing, written, skip, carry = layout
                pieces[-1] = pieces[-1][: len(pieces[-1]) - trailing]
                done += skip
        pieces.append(written)
    pieces.append(text[done:])
    return "".join(pieces)
