r"""Maths the model wrote with no delimiters: ``\begin{pmatrix}...\end{pmatrix}``,
``\bar{x} = \underline{...} \qquad s = ...``. Each such run becomes one
<latex-inline> (or <latex-block>) tag.

apps/web/src/lib/bare-math.ts and apps/server/ui/src/shared/bare-math.ts apply
the same rule to text that never passed through here, and
tests/fixtures/math-repair.json holds the cases all three must agree on.

A run is joined items: a command with its arguments, a math environment, a
braced group, or a short word or number (`df`, `n`, `0.05`, `R(\theta)`),
linked by an operator (`=`, `+`, `-`, `\qquad` ...). A run with no command or
environment in it is plain text.
"""

import re
from collections.abc import Callable

# Text this repair must leave alone: maths already tagged, TikZ (shown as
# source), and inline code.
PROTECTED = re.compile(
    r"(<latex-(?:block|inline)>.*?</latex-(?:block|inline)>"
    r"|\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}"
    r"|`[^`\n]*`)",
    re.DOTALL,
)

# \[ opens display maths unless it is the length of a line break, as in
# \\[4pt].
LENGTH = r"\s*-?[\d.]+\s*(?:pt|em|ex|mm|cm|in)\s*\]"

# Braced groups nested up to three deep.
_BRACED = r"\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}"
# \qquad and \quad join the items either side of them, like an operator.
_COMMAND = rf"\\(?!begin\b|end\b|q?quad\b)[A-Za-z]+(?:{_BRACED}|\d+)*"

# Environments that hold maths. align and gather are display-only, which KaTeX
# refuses inside a line of text, so they are written as their inline forms.
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
_DISPLAY_ONLY = re.compile(r"\\(begin|end)\{(align|gather)\*?\}")
_ENVIRONMENT = "|".join(
    rf"\\begin\{{{re.escape(name)}\}}.*?\\end\{{{re.escape(name)}\}}"
    for name in _ENVIRONMENTS
)

_COMMANDS = rf"(?:{_ENVIRONMENT}|{_COMMAND})(?:[ \t]*(?:{_ENVIRONMENT}|{_COMMAND}))*"
_WORD = r"(?:\d+(?:\.\d+)?|[A-Za-z]+)(?:\([^()\n]{0,30}\))?"
_ITEM = rf"(?:{_COMMANDS}|{_BRACED}|{_WORD})"
_OPERATOR = r"[ \t]*(?:[=<>+\-/^_≤≥≠≈±×÷]|\\q?quad(?![A-Za-z])|\\[,;])[ \t]*"
_RUN = re.compile(rf"{_ITEM}(?:{_OPERATOR}{_ITEM})*", re.DOTALL)

_HAS_MATHS = re.compile(r"\\(?!q?quad\b)[A-Za-z]")


def _tagged(run: re.Match) -> str:
    text = run.group(0)
    if not _HAS_MATHS.search(text):
        return text
    inline = _DISPLAY_ONLY.sub(r"\\\1{\2ed}", text)
    return f"<latex-inline>{inline}</latex-inline>"


def map_unprotected(text: str, rewrite: Callable[[str], str]) -> str:
    """The text with ``rewrite`` applied to everything but the delimited
    maths, code and TikZ in it."""
    parts = PROTECTED.split(text)
    for index in range(0, len(parts), 2):
        parts[index] = rewrite(parts[index])
    return "".join(parts)


def tag_bare_maths(text: str) -> str:
    """The text with each run of undelimited maths tagged."""
    return map_unprotected(text, lambda part: _RUN.sub(_tagged, part))
