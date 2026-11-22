r"""The tutor's maths as the frontend renders it: every delimiter made a
<latex-block> or <latex-inline> tag, and maths the model wrote with no
delimiters tagged too.

repair_reply is the rule for free text, the tutor's chat answers. A pair of
dollar signs is left to remark-math in it, which reads $...$ itself, and every
other dollar sign is written \$, so that none pairs with another in a sentence
about a shell, a URL or a price. reply_text is what clients are sent, the tags
written as $ and $$. The same rule is apps/web/src/lib/latex.ts and
apps/server/ui/src/shared/latex.ts, which apply it to text that never passed
through here (lessons stored before it, replies still streaming);
tests/fixtures/math-repair.json holds the cases all three must agree on.
markdown.py adds what only a lesson's JSON fields need.

Code is never touched: see maths_scan.py. Bare maths is maths_runs.py.
"""

import re

from .maths_runs import RENAMED_ENVIRONMENTS, UNWRAPPED_ENVIRONMENTS, tag_bare_maths
from .maths_scan import (
    LENGTH,
    is_escaped,
    map_maths,
    map_unprotected,
    scan,
    tag_delimiters,
    tags_as_dollars,
)

__all__ = [
    "LENGTH",
    "map_unprotected",
    "repair_reply",
    "reply_text",
    "tag_delimiters",
    "tag_undelimited",
    "unmangled_line_breaks",
]

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


# A line break with a length, \\[4pt], that an earlier version of the web
# read as a display delimiter and wrote as \$$4pt].
_MANGLED_LINE_BREAK = re.compile(rf"\\\$\$(?={LENGTH})")


def unmangled_line_breaks(text: str) -> str:
    return _MANGLED_LINE_BREAK.sub(lambda _m: "\\\\[", text)


_ENVIRONMENT_NAME = "|".join(
    re.escape(name) for name in (*RENAMED_ENVIRONMENTS, *UNWRAPPED_ENVIRONMENTS)
)
_DISPLAY_ONLY = re.compile(rf"\\(begin|end)\{{({_ENVIRONMENT_NAME})\}}")
# A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
# the whole formula as source. \_ is the underscore itself.
_BLANK = re.compile(r"(?<!\\)_{2,}")


def _inline_environment(match: re.Match) -> str:
    name = match.group(2)
    if name in UNWRAPPED_ENVIRONMENTS:
        return ""
    return f"\\{match.group(1)}{{{RENAMED_ENVIRONMENTS[name]}}}"


# A dollar sign cannot be written in maths as \$: the reader of $...$ ends the
# span at it. KaTeX sets the character with \char.
_DOLLAR_IN_MATHS = re.compile(r"\\\\|\\?\$")
_DOLLAR_SIGN = '\\char"24{}'


def _inline_maths(maths: str) -> str:
    # Environments KaTeX refuses within a line of text are written as the ones
    # it accepts.
    inline = _DISPLAY_ONLY.sub(_inline_environment, maths)
    inline = _BLANK.sub(lambda run: "\\_" * len(run[0]), inline)
    return _DOLLAR_IN_MATHS.sub(
        lambda m: m.group(0) if m.group(0) == "\\\\" else _DOLLAR_SIGN, inline
    )


def tag_undelimited(text: str) -> str:
    """Phonetic letters made text, bare maths tagged, and every span made
    something KaTeX accepts within a line of text."""
    text = map_unprotected(text, _phonetic_letters)
    return map_maths(tag_bare_maths(text), _inline_maths)


_DOLLAR = re.compile(r"\\\\|\\\$|\$")
# The escaped dollar signs that end a piece of text.
_TRAILING_DOLLARS = re.compile(r"(?:\\\$)+$")


def _escaped_dollars(text: str) -> str:
    return _DOLLAR.sub(lambda m: "\\$" if m.group(0) == "$" else m.group(0), text)


def escape_stray_dollars(text: str) -> str:
    """A dollar sign outside every span is a dollar sign, not an opener, and is
    written \\$. One right before a span of maths is the sign of its amount
    (`$5 \\times 3`), and goes into the maths: `\\$$` is no good to a reader."""
    pieces, done = [], 0
    for span in [*scan(text), None]:
        end = len(text) if span is None else span.start
        segment = _escaped_dollars(text[done:end])
        opening = "" if span is None else text[span.start : span.end]
        touching = segment.endswith("\\$") and is_escaped(segment, len(segment) - 1)
        if touching and opening.startswith("<latex-inline>"):
            amounts = len(_TRAILING_DOLLARS.search(segment)[0]) // 2
            segment = segment[: len(segment) - 2 * amounts]
            rest = opening[len("<latex-inline>") :]
            opening = f"<latex-inline>{_DOLLAR_SIGN * amounts}{rest}"
        elif touching and span is not None:
            segment += " "
        pieces.extend((segment, opening))
        done = end if span is None else span.end
    return "".join(pieces)


def repair_reply(text: str) -> str:
    if not text:
        return text
    text = unmangled_line_breaks(text)
    text = tag_undelimited(tag_delimiters(text, dollars=False))
    return escape_stray_dollars(text)


def reply_text(text: str) -> str:
    """What a client is sent: the reply with its maths written as $ and $$."""
    return tags_as_dollars(repair_reply(text))
