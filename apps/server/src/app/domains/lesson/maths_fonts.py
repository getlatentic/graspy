r"""Words written inside a maths font command, which KaTeX sets without spaces.

`\mathrm{Akwa Ibom}` is valid LaTeX and shows "AkwaIbom": maths mode ignores
spaces, and a font command only changes the letters. `\text{Akwa Ibom}` keeps
them. A font command whose group holds a phrase (two or more tokens, one of
them a word of two letters or more) is written as its text command: `\mathrm`
and `\operatorname` as `\text`, `\mathbf` as `\textbf`, `\mathit` as `\textit`,
`\mathsf` as `\textsf`, `\mathtt` as `\texttt`.

A group is left alone when it is a symbol or a name (`\mathrm{d}`, `\mathbf{v}`,
`\mathrm{km}`), when it holds a command, brace, script, slash or any character
that is maths (`\mathrm{m s^{-1}}`, `\mathrm{km/h}`), when it is single letters
(`\mathrm{m s}`), and for `\operatorname` when every word is one of an
operator's own (`\operatorname{arg max}`). So are `\mathbb`, `\mathcal` and
`\mathfrak`, which have no text command, and `\operatorname*`.

apps/web/src/lib/latex-fonts.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re
import unicodedata

_TEXT_COMMANDS = {
    "mathrm": "text",
    "mathbf": "textbf",
    "mathit": "textit",
    "mathsf": "textsf",
    "mathtt": "texttt",
    "operatorname": "text",
}
# A group with no brace, backslash or script of its own.
_FONT = re.compile(
    rf"\\({'|'.join(_TEXT_COMMANDS)})(?![A-Za-z*])[ \t\r\n]*\{{([^{{}}\\]*)\}}"
)
_BLANKS = re.compile(r"[ \t\r\n]+")
_PUNCTUATION = ".,;:!?'’()-"
_OPERATOR_WORDS = frozenset(("arg", "max", "min", "sup", "inf", "lim"))


def _is_prose_char(char: str) -> bool:
    return (
        char.isalpha()
        or unicodedata.category(char).startswith("M")
        or "0" <= char <= "9"
        or char in _PUNCTUATION
    )


def _is_word(token: str) -> bool:
    return sum(char.isalpha() for char in token) >= 2


def _is_phrase(command: str, body: str) -> bool:
    tokens = [token for token in _BLANKS.split(body) if token]
    if len(tokens) < 2 or not all(_is_prose_char(char) for char in "".join(tokens)):
        return False
    if not any(_is_word(token) for token in tokens):
        return False
    return command != "operatorname" or not all(
        token in _OPERATOR_WORDS for token in tokens
    )


def _escaped(text: str, position: int) -> bool:
    """Whether an odd number of backslashes come right before the position."""
    start = position
    while start > 0 and text[start - 1] == "\\":
        start -= 1
    return (position - start) % 2 == 1


def _rewrite(match: re.Match) -> str:
    command, body = match.groups()
    if _escaped(match.string, match.start()) or not _is_phrase(command, body):
        return match.group(0)
    return f"\\{_TEXT_COMMANDS[command]}{{{body}}}"


def words_as_text(maths: str) -> str:
    """The maths with each phrase in a font command written in a text command."""
    return _FONT.sub(_rewrite, maths)
