r"""Model output as the frontend renders it: mangled LaTeX restored, and
every maths delimiter made a <latex-block> or <latex-inline> tag."""

import functools
import re
from collections.abc import Callable

from .bare_math import LENGTH, map_unprotected, tag_bare_maths

# A maths span holding only single letters separated by spaces or commas is a
# list of letters (the alphabet), which KaTeX would set in italic maths type.
_LETTER_LIST = re.compile(
    r"<latex-(block|inline)>\s*([A-Za-z](?:[\s,]+[A-Za-z]){3,})\s*</latex-\1>"
)

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

# A model that learned JSON escaping sometimes doubles every backslash even
# in a plain-text field: \\(\\frac ...\\). Doubled before a letter or a
# bracket it is never meant; a LaTeX line break is \\ before a space or a line
# end, and stays. \\[4pt] is a line break with extra space, so a [ opening a
# length is not a doubled backslash.
_DOUBLED_BACKSLASH = re.compile(
    r"\\\\(?=[A-Za-z()\]]|\[(?!\s*-?[\d.]+\s*(?:pt|em|ex|mm|cm|in)\s*\]))"
)

# JSON parsing turns a lone \t, \r, \f or \b into a control character; one
# before a letter was a LaTeX command such as \text. A newline is ambiguous,
# so it stays.
_CONTROL_BEFORE_LETTER = re.compile(r"[\x08\x0c\r\t](?=[a-zA-Z])")
_CONTROL_LETTERS = {"\x08": "b", "\x0c": "f", "\r": "r", "\t": "t"}

_BLOCK = r"<latex-block>\1</latex-block>"
_INLINE = r"<latex-inline>\1</latex-inline>"
# $$ before $, so a display span is not read as two inline ones.
_DELIMITERS = (
    (re.compile(r"\$\$(.*?)\$\$", re.DOTALL), _BLOCK),
    (re.compile(rf"\\\[(?!{LENGTH})(.*?)\\\]", re.DOTALL), _BLOCK),
    (re.compile(r"\\\((.*?)\\\)", re.DOTALL), _INLINE),
    # Money in a word problem is two dollar signs in one sentence, so a bare
    # pair is not enough to mean maths: the span must not open or close on
    # whitespace, and a digit after the closing $ means it was a price.
    (re.compile(r"(?<![\\$])\$(?!\s)([^$]*?)(?<!\s)\$(?!\d)"), _INLINE),
)

# A bold run ending in a newline, **Title:\n**, closes before it. The run must
# open on text and close on its own, within one line break, or one phrase's
# closing ** pairs with the next phrase's opening ** across a paragraph break.
_BOLD_NEWLINE = re.compile(
    r"(?<!\*)\*\*(?P<content>[^\s*][^*\n]*?)[ \t]*\n[ \t]*\*\*(?=\s|$)"
)

_MATHS_SPAN = re.compile(
    r"(<latex-(?:block|inline)>)(.*?)(</latex-(?:block|inline)>)", re.DOTALL
)
# A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
# the whole formula as source. \_ is the underscore itself.
_BLANK = re.compile(r"(?<!\\)_{2,}")

_TIKZ = re.compile(r"(\\begin\{tikzpicture\}.*?\\end\{tikzpicture\})", re.DOTALL)


def _phonetic_letters(text: str) -> str:
    return _TEXT_COMMAND.sub(lambda m: _TEXT_COMMANDS[m.group(1)], text)


def _blanks_as_underscores(span: re.Match) -> str:
    opening, maths, closing = span.groups()
    return opening + _BLANK.sub(lambda run: "\\_" * len(run[0]), maths) + closing


def _repair_bare_commands(text: str) -> str:
    """Phonetic letters become text; any other command, or run of maths with
    one in it, becomes inline maths."""
    return tag_bare_maths(map_unprotected(text, _phonetic_letters))


def _substitution(pattern: re.Pattern, replacement) -> Callable[[str], str]:
    return functools.partial(pattern.sub, replacement)


_REPAIRS: tuple[Callable[[str], str], ...] = (
    # The model writes @@ for a LaTeX backslash ("@@frac12"), sparing it the
    # escaping a backslash needs inside JSON.
    lambda text: text.replace("@@", "\\"),
    _substitution(_DOUBLED_BACKSLASH, r"\\"),
    _substitution(
        _CONTROL_BEFORE_LETTER, lambda m: "\\" + _CONTROL_LETTERS[m.group(0)]
    ),
    *(_substitution(pattern, tag) for pattern, tag in _DELIMITERS),
    _substitution(_LETTER_LIST, lambda m: m.group(2).strip()),
    _repair_bare_commands,
    _substitution(_MATHS_SPAN, _blanks_as_underscores),
    _substitution(_BOLD_NEWLINE, r"**\g<content>**\n"),
    # The frontend renders a tikz code block as a diagram.
    _substitution(_TIKZ, r"\n```tikz\n\1\n```\n"),
)


def repair_markdown(text: str) -> str:
    if not text:
        return text
    for repair in _REPAIRS:
        text = repair(text)
    return text
