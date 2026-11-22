r"""The tutor's maths as the frontend renders it: every delimiter made a
<latex-block> or <latex-inline> tag, and maths the model wrote with no
delimiters tagged too.

repair_reply is the rule for free text, the tutor's chat answers. A pair of
dollar signs is left alone in it: remark-math reads $...$ itself, and in a
sentence about a shell or a URL it is not maths. reply_text is what clients are
sent, the tags written as $ and $$. The same rule is
apps/web/src/lib/latex.ts and apps/server/ui/src/shared/latex.ts, which apply
it to text that never passed through here (lessons stored before it, replies
still streaming); tests/fixtures/math-repair.json holds the cases all three
must agree on. markdown.py adds what only a lesson's JSON fields need.

Code is never touched: see maths_scan.py. Bare maths is maths_runs.py.
"""

import re

from .maths_runs import tag_bare_maths
from .maths_scan import (
    LENGTH,
    map_maths,
    map_unprotected,
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


_DISPLAY_ONLY = re.compile(r"\\(begin|end)\{(align|gather)\*?\}")
# A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
# the whole formula as source. \_ is the underscore itself.
_BLANK = re.compile(r"(?<!\\)_{2,}")


def _inline_maths(maths: str) -> str:
    # align and gather are display-only, which KaTeX refuses inside a line.
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
    return tag_undelimited(tag_delimiters(text, dollars=False))


def reply_text(text: str) -> str:
    """What a client is sent: the reply with its maths written as $ and $$."""
    return tags_as_dollars(repair_reply(text))
