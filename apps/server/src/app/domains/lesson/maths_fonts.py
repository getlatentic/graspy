r"""Words written inside a maths font command, which KaTeX sets without spaces.

`\mathrm{Akwa Ibom}` is valid LaTeX and shows "AkwaIbom": maths mode ignores
spaces, and a font command only changes the letters. `\text{Akwa Ibom}` keeps
them. A font command whose group holds words is written as its text command:
`\mathrm` and `\operatorname` as `\text`; `\mathbf`, `\boldsymbol`, `\bm` and
`\pmb` as `\textbf`; `\mathit` and `\mathnormal` as `\textit`; `\mathsf` as
`\textsf`; `\mathtt` as `\texttt`.

Words are a group of blank-separated tokens, one of them a word (two letters or
more, with punctuation allowed between them: `re-do`), or a word with blanks
before or after it (`\mathrm{ and }`, the way a model most often writes it).
The characters are letters, marks, digits and `.,;:!?'’()-`. The group is
left alone when it is a symbol or a name with no blank round it
(`\mathrm{d}`, `\mathbf{v}`, `\mathrm{km}`), a single letter with blanks round
it (`\mathrm{ d }`), single letters (`\mathrm{m s}`), or holds a command, brace,
script, slash or any other character that is maths (`\mathrm{m s^{-1}}`,
`\mathrm{km/h}`, `\mathrm{a + b}`). `\operatorname` is a name, so it needs two
tokens, and is left alone when all are an operator's own words
(`\operatorname{arg max}`, `\operatorname{ess sup}`). `\mathbb`, `\mathcal` and
`\mathfrak` have no text command and `\operatorname*` is a limit operator: both
are left alone.

apps/web/src/lib/latex-fonts.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re
import unicodedata

_TEXT_COMMANDS = {
    "mathrm": "text",
    "mathbf": "textbf",
    "boldsymbol": "textbf",
    "bm": "textbf",
    "pmb": "textbf",
    "mathit": "textit",
    "mathnormal": "textit",
    "mathsf": "textsf",
    "mathtt": "texttt",
    "operatorname": "text",
}
# A group with no brace, backslash or script of its own.
_FONT = re.compile(
    rf"\\({'|'.join(_TEXT_COMMANDS)})(?![A-Za-z*])[ \t\r\n]*\{{([^{{}}\\]*)\}}"
)
_BLANKS = re.compile(r"[ \t\r\n]+")
_BLANK_CHARS = " \t\r\n"
_PUNCTUATION = ".,;:!?'’()-"
_OPERATOR_WORDS = frozenset(("arg", "ess", "max", "min", "sup", "inf", "lim"))


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
    if not tokens or not all(_is_prose_char(char) for char in "".join(tokens)):
        return False
    if not any(_is_word(token) for token in tokens):
        return False
    if command == "operatorname":
        return len(tokens) > 1 and not all(token in _OPERATOR_WORDS for token in tokens)
    padded = body[0] in _BLANK_CHARS or body[-1] in _BLANK_CHARS
    return len(tokens) > 1 or padded


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
    """The maths with each group of words in a font command written in a text
    command."""
    return _FONT.sub(_rewrite, maths)
