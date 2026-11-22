r"""The tutor's maths as the frontend renders it: every delimiter made a
<latex-block> or <latex-inline> tag, and maths the model wrote with no
delimiters (``\begin{pmatrix}...\end{pmatrix}``,
``\bar{x} = \underline{...} \qquad s = ...``) tagged too.

repair_reply is the rule for free text, the tutor's chat answers. The same rule
is apps/web/src/lib/latex.ts and apps/server/ui/src/shared/latex.ts, which
apply it to text that never passed through here (lessons stored before it,
replies still streaming); tests/fixtures/math-repair.json holds the cases all
three must agree on. markdown.py adds what only a lesson's JSON fields need.

Code is never touched: fenced and indented blocks and inline code are
protected from every pass. No span of maths runs over a blank line or past
MAX_SPAN characters, which also bounds the work of each scan.
"""

import re
from collections.abc import Callable

MAX_SPAN = 3000
# An environment is tried at every \begin, so its bound is tighter.
MAX_ENVIRONMENT = 1000

_OPENER = re.compile(
    r"<latex-(block|inline)>|```|~~~|`|\\begin\{tikzpicture\}"
    # Indented code follows a blank line, and is not a list item's continuation.
    r"|(?:^|\n[ \t]*\n)(?: {4}|\t)(?![ \t]*(?:[-*+]|\d+[.)])[ \t])"
)


def _bounded_find(text: str, needle: str, start: int) -> int:
    return text.find(needle, start, start + MAX_SPAN + len(needle))


def _span_end(text: str, opener: re.Match) -> int | None:
    """Where the span the opener begins ends, or None when it never closes."""
    kind, after = opener.group(0), opener.end()
    if kind.startswith("<latex-"):
        close = f"</latex-{opener.group(1)}>"
        end = _bounded_find(text, close, after)
        return None if end == -1 else end + len(close)
    if kind in ("```", "~~~"):
        # An unclosed fence is a block still being written: code to the end.
        end = text.find(kind, after)
        return len(text) if end == -1 else end + len(kind)
    if kind == "`":
        end = text.find("`", after)
        if end == -1 or text.find("\n", after, end) != -1:
            return None
        return end + 1
    if kind.startswith("\\begin"):
        close = "\\end{tikzpicture}"
        end = text.find(close, after)
        return None if end == -1 else end + len(close)
    return _indented_block_end(text, after)


def _indented_block_end(text: str, after: int) -> int:
    line_end = text.find("\n", after)
    while line_end != -1 and text.startswith(("    ", "\t"), line_end + 1):
        line_end = text.find("\n", line_end + 1)
    return len(text) if line_end == -1 else line_end


def _is_indented(opener: re.Match) -> bool:
    return opener.group(0).endswith((" ", "\t"))


def _is_tikz(opener: re.Match) -> bool:
    return opener.group(0).startswith("\\begin")


def map_unprotected(
    text: str,
    rewrite: Callable[[str], str],
    *,
    protect_tikz: bool = True,
    protect_indented: bool = True,
) -> str:
    """The text with ``rewrite`` applied to everything but the code, TikZ and
    maths already tagged in it. A rewrite of TikZ itself passes
    ``protect_tikz=False``; one that restores a tab the JSON turned into a
    control character passes ``protect_indented=False``."""
    pieces, done, search = [], 0, 0
    while opener := _OPENER.search(text, search):
        skipped = (_is_tikz(opener) and not protect_tikz) or (
            _is_indented(opener) and not protect_indented
        )
        end = None if skipped else _span_end(text, opener)
        if end is None:
            search = opener.end()
            continue
        pieces.append(rewrite(text[done : opener.start()]))
        pieces.append(text[opener.start() : end])
        done = search = end
    pieces.append(rewrite(text[done:]))
    return "".join(pieces)


_TAG = re.compile(r"<latex-(block|inline)>")


def map_maths(text: str, rewrite: Callable[[str], str]) -> str:
    """The text with ``rewrite`` applied to the inside of each tagged span."""
    pieces, done = [], 0
    while opener := _TAG.search(text, done):
        close = f"</latex-{opener.group(1)}>"
        end = _bounded_find(text, close, opener.end())
        pieces.append(text[done : opener.end()])
        done = opener.end()
        if end != -1:
            pieces.append(rewrite(text[done:end]))
            done = end
    pieces.append(text[done:])
    return "".join(pieces)


# \[ opens display maths unless it is the length of a line break, as in
# \\[4pt]. The units are TeX's and KaTeX's.
LENGTH_UNITS = "pt|pc|bp|dd|cc|sp|mm|cm|in|em|ex|mu|px|nd|nc"
LENGTH = rf"\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*(?:{LENGTH_UNITS})\s*\]"

# Characters of a span: any, but not across a blank line.
_IN_SPAN = r"(?:[^\n]|\n(?![ \t]*\n))"
_BLANK_LINE = re.compile(r"\n[ \t]*\n")
_LENGTH_AT = re.compile(LENGTH)

# A doubled backslash is a line break and never opens a delimiter, so \\[note]
# is not one. $$ before $, so a display span is not read as two inline ones.
_DELIMITER = re.compile(r"\\\\|\\\$|\$\$|\$|\\\[|\\\(")
_CLOSERS = {"$$": "$$", "\\[": "\\]", "\\(": "\\)", "$": "$"}


def _delimited(text: str, opener: str, after: int) -> tuple[int, str] | None:
    """The end of the closing delimiter and the tag the span takes, or None
    when the opener opens no span."""
    if opener == "\\[" and _LENGTH_AT.match(text, after):
        return None
    closer = _CLOSERS[opener]
    end = _bounded_find(text, closer, after)
    if end == -1 or _BLANK_LINE.search(text, after, end):
        return None
    if opener == "$":
        # Money in a word problem is two dollar signs in one sentence, so a
        # bare pair is not enough to mean maths: the span must not open or
        # close on whitespace, and a digit after the closing $ means it was a
        # price.
        maths = text[after:end]
        if not maths or maths[0].isspace() or maths[-1].isspace():
            return None
        following = text[end + 1 : end + 2]
        if following.isdecimal() and following.isascii():
            return None
    tag = "block" if opener in ("$$", "\\[") else "inline"
    return end + len(closer), tag


def _tagged_delimiters(text: str) -> str:
    pieces, done, search = [], 0, 0
    while found := _DELIMITER.search(text, search):
        opener = found.group(0)
        if opener in ("\\\\", "\\$"):
            search = found.end()
            continue
        span = _delimited(text, opener, found.end())
        if span is None:
            search = found.start() + 1
            continue
        end, tag = span
        close = len(_CLOSERS[opener])
        pieces.append(text[done : found.start()])
        pieces.append(f"<latex-{tag}>{text[found.end() : end - close]}</latex-{tag}>")
        done = search = end
    pieces.append(text[done:])
    return "".join(pieces)


def tag_delimiters(text: str) -> str:
    """Every maths delimiter made a tag."""
    return map_unprotected(text, _tagged_delimiters)


# Text-mode LaTeX for letters used in phonetics. Outside a maths span nothing
# renders them, and the learner would read "/\ae/" where the model means /æ/.
_TEXT_COMMANDS = {
    "ae": "æ",
    "AE": "Æ",
    "oe": "œ",
    "OE": "Œ",
    "ss": "ß",
    "o": "ø",
    "O": "Ø",
}
_TEXT_COMMAND = re.compile(r"\\(ae|AE|oe|OE|ss|o|O)(?![A-Za-z])")


def _phonetic_letters(text: str) -> str:
    return _TEXT_COMMAND.sub(lambda m: _TEXT_COMMANDS[m.group(1)], text)


# A run is joined items, linked by an operator: a command with its arguments,
# a math environment, a braced or parenthesised group, a single letter, a
# number, or a name that a relation follows (`df =`). Words of prose join
# nothing, so "the sum - \sqrt{2}" keeps "the sum". A run with no command or
# environment in it is plain text.
_BRACED_1 = r"\{[^{}]{0,200}\}"
_BRACED_2 = rf"\{{(?:[^{{}}]|{_BRACED_1}){{0,200}}\}}"
_BRACED = rf"\{{(?:[^{{}}]|{_BRACED_2}){{0,200}}\}}"
# \qquad and \quad join the items either side of them, like an operator.
_COMMAND = rf"\\(?!begin\b|end\b|q?quad\b)[A-Za-z]+(?:{_BRACED}|\d+)*"
# align and gather are display-only, which KaTeX refuses inside a line of text.
_ENVIRONMENTS = (
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
    "smallmatrix",
    "array",
    "aligned",
    "alignedat",
    "gathered",
    "cases",
    "align",
    "align*",
    "gather",
    "gather*",
)
_ENVIRONMENT = "|".join(
    rf"\\begin\{{{re.escape(name)}\}}{_IN_SPAN}{{0,{MAX_ENVIRONMENT}}}?\\end\{{{re.escape(name)}\}}"
    for name in _ENVIRONMENTS
)
_PAREN = r"\((?:\\[A-Za-z]+|[A-Za-z](?![A-Za-z])|[^A-Za-z()\n\\]){1,60}\)"
_RELATION = r"[=<>≤≥≠≈]"
_SHORT = r"(?:[A-Za-z](?![A-Za-z])|\d+(?:\.\d+)?)"
_NAME = rf"[A-Za-z]{{2,}}(?![A-Za-z])(?=[ \t]*{_RELATION})"
_COMMANDS = rf"(?:{_ENVIRONMENT}|{_COMMAND})(?:[ \t]*(?:{_ENVIRONMENT}|{_COMMAND}))*"
_ITEM = rf"(?:{_COMMANDS}|{_BRACED}|{_PAREN}|{_SHORT}|{_NAME})+"
_OPERATOR = rf"[ \t]*(?:[+\-/^_±×÷]|{_RELATION}|\\q?quad(?![A-Za-z])|\\[,;])[ \t]*"
# A word that is no item is taken whole, so no run starts in the middle of it.
_RUN = re.compile(rf"{_ITEM}(?:{_OPERATOR}{_ITEM})*|[A-Za-z]+")

_HAS_COMMAND = re.compile(r"\\(?!q?quad\b)[A-Za-z]")


_PAREN_GROUP = re.compile(_PAREN)
_PADDED = re.compile(r"(\s*)(.*?)(\s*)", re.DOTALL)


def _tagged_run(run: re.Match) -> str:
    text = run.group(0)
    if not _HAS_COMMAND.search(text):
        return text
    if _PAREN_GROUP.fullmatch(text):
        # A group of parentheses alone is punctuation round the maths.
        before, maths, after = _PADDED.fullmatch(text[1:-1]).groups()
        return f"({before}<latex-inline>{maths}</latex-inline>{after})"
    return f"<latex-inline>{text}</latex-inline>"


def tag_bare_maths(text: str) -> str:
    """Each run of undelimited maths tagged."""
    return map_unprotected(text, lambda part: _RUN.sub(_tagged_run, part))


_DISPLAY_ONLY = re.compile(r"\\(begin|end)\{(align|gather)\*?\}")
# A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
# the whole formula as source. \_ is the underscore itself.
_BLANK = re.compile(r"(?<!\\)_{2,}")


def _inline_maths(maths: str) -> str:
    inline = _DISPLAY_ONLY.sub(r"\\\1{\2ed}", maths)
    return _BLANK.sub(lambda run: "\\_" * len(run[0]), inline)


def tag_undelimited(text: str) -> str:
    """Phonetic letters made text, bare maths tagged, and every span made
    something KaTeX accepts within a line of text."""
    text = map_unprotected(text, _phonetic_letters)
    return map_maths(tag_bare_maths(text), _inline_maths)


def repair_reply(text: str) -> str:
    if not text:
        return text
    return tag_undelimited(tag_delimiters(text))
