r"""A lesson's fields as the frontend renders them: what a lesson's JSON fields
need on top of maths.py's repair of free text.

Only these fields are written as JSON strings, so only here are @@, control
characters and doubled backslashes meant as LaTeX. A chat answer is plain text,
where a tab is a tab and ``@@ -1,3 +1,3 @@`` is a diff, so it goes through
repair_reply alone. The web's repair is repair_reply's twin and leaves the rest
to the server. So does the alphabet rule below, which would strip the maths
from a chat answer's "let $a, b, c, d$ be the coefficients"."""

import re

from .maths import (
    LENGTH,
    repair_reply,
    tag_delimiters,
    tag_undelimited,
    unmangled_line_breaks,
)
from .maths_scan import MAX_INLINE, map_tikz, map_unprotected

# A maths span holding only single letters separated by spaces or commas is a
# list of letters (the alphabet), which KaTeX would set in italic maths type.
_LETTER_LIST = re.compile(
    r"<latex-(block|inline)>\s*([A-Za-z](?:[\s,]+[A-Za-z]){3,})\s*</latex-\1>"
)

# A model that learned JSON escaping sometimes doubles every backslash even
# in a plain-text field: \\(\\frac ...\\). Doubled before a letter or a
# bracket it is never meant; a LaTeX line break is \\ before a space or a line
# end, and stays. \\[4pt] is a line break with extra space, so a [ opening a
# length is not a doubled backslash, and a [ opens one only where a doubled
# backslash closes it.
_DOUBLED_CLOSE = rf"(?:[^\n]|\n(?![ \t]*\n)){{0,{MAX_INLINE}}}?\\\\\]"
_DOUBLED_BACKSLASH = re.compile(
    rf"\\\\(?=[A-Za-z()\]]|\[(?!{LENGTH})(?={_DOUBLED_CLOSE}))"
)

# JSON parsing turns a lone \t, \r, \f or \b into a control character; one
# before a letter was a LaTeX command such as \text. A newline is ambiguous,
# so it stays.
_CONTROL_BEFORE_LETTER = re.compile(r"[\x08\x0c\r\t](?=[a-zA-Z])")
_CONTROL_LETTERS = {"\x08": "b", "\x0c": "f", "\r": "r", "\t": "t"}

# A bold run ending in a newline, **Title:\n**, closes before it. The run must
# open on text and close on its own, within one line break, or one phrase's
# closing ** pairs with the next phrase's opening ** across a paragraph break.
_BOLD_NEWLINE = re.compile(
    r"(?<!\*)\*\*(?P<content>[^\s*][^*\n]*?)[ \t]*\n[ \t]*\*\*(?=\s|$)"
)


def _restored(text: str) -> str:
    # The model writes @@ for a LaTeX backslash ("@@frac12"), sparing it the
    # escaping a backslash needs inside JSON.
    text = text.replace("@@", "\\")
    text = _DOUBLED_BACKSLASH.sub(r"\\", text)
    return _CONTROL_BEFORE_LETTER.sub(
        lambda m: "\\" + _CONTROL_LETTERS[m.group(0)], text
    )


def _bold_closed_before_newline(text: str) -> str:
    return _BOLD_NEWLINE.sub(r"**\g<content>**\n", text)


def _tikz_fenced(picture: str) -> str:
    # The frontend renders a tikz code block as a diagram.
    return f"\n```tikz\n{picture}\n```\n"


def repair_markdown(text: str) -> str:
    if not text:
        return text
    text = unmangled_line_breaks(text)
    text = map_unprotected(text, _restored, indented=False, in_maths=True)
    text = _LETTER_LIST.sub(
        lambda m: m.group(2).strip(), tag_delimiters(text, dollars=True)
    )
    text = map_unprotected(tag_undelimited(text), _bold_closed_before_newline)
    return map_tikz(text, _tikz_fenced)


__all__ = ["repair_markdown", "repair_reply"]
