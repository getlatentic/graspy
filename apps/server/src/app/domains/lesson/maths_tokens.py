r"""The tokens a formula is read from: the words KaTeX's commands and the model's
names make, the pieces a regex finds, and the edge each piece has in a run.

apps/web/src/lib/latex-tokens.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases, and the vocabulary, both must
agree on.
"""

import re
from collections.abc import Callable

from .maths_vocabulary import (
    COMMANDS,
    DISPLAY_ONLY_ENVIRONMENTS,
    INFIX,
    NEEDS_ARGUMENT,
)

# A name, not a word of prose, that may stand in a formula: `df = n - 1`.
_NAME_WORDS = "p-value df dx dy dz dt ds dr du dv dw SE SD CI Var Cov Corr Pr det rank dim gcd lcm erf sgn"
NAMES = _NAME_WORDS.split()

# Commands whose argument, or whose variable, is the letter after a space.
_FUNCTION_WORDS = (
    "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa "
    "lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi "
    "psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega ell hbar "
    "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp "
    "lim limsup liminf max min sup inf det arg dim ker gcd lcm sum prod int iint iiint "
    "oint partial nabla"
)
FUNCTIONS = _FUNCTION_WORDS.split()

# Display-only environments have no inline form, and KaTeX refuses them within
# a line of text: they are written as the form that has one.
RENAMED_ENVIRONMENTS = {
    "align": "aligned",
    "align*": "aligned",
    "alignat": "alignedat",
    "alignat*": "alignedat",
    "gather": "gathered",
    "gather*": "gathered",
    "split": "aligned",
}
UNWRAPPED_ENVIRONMENTS = ("equation", "equation*")
# What is left is display maths and nothing else.
BLOCK_ONLY = tuple(
    name
    for name in DISPLAY_ONLY_ENVIRONMENTS
    if name not in RENAMED_ENVIRONMENTS and name not in UNWRAPPED_ENVIRONMENTS
)

GROUP, PLAIN, ENVIRONMENT, END = "", "", "", ""
MARKS = f"[{GROUP}{PLAIN}{ENVIRONMENT}]"
_SENTINEL = re.compile(rf"{MARKS}[0-9]+{END}")

_COMMAND_SET = frozenset(COMMANDS)
NAME_SET = frozenset(NAMES)
INFIX_SET = frozenset(INFIX)
_FUNCTION_SET = frozenset(FUNCTIONS)
_NEEDS_SET = frozenset(NEEDS_ARGUMENT)
_SPACING = frozenset(("quad", "qquad"))
_OPENING = frozenset(("left", "bigl", "Bigl", "biggl", "Biggl"))
_CLOSING = frozenset(("right", "bigr", "Bigr", "biggr", "Biggr"))
_SIZED = frozenset(("middle", "big", "Big", "bigg", "Bigg"))
# Delimiters that open and close a group of their own accord.
_OPENS = frozenset(
    (
        "lvert",
        "lVert",
        "langle",
        "lfloor",
        "lceil",
        "lbrace",
        "lbrack",
        "lgroup",
        "lmoustache",
    )
)
_CLOSES = frozenset(
    (
        "rvert",
        "rVert",
        "rangle",
        "rfloor",
        "rceil",
        "rbrace",
        "rbrack",
        "rgroup",
        "rmoustache",
    )
)
_DELIMITER_WORDS = (
    "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil vert Vert "
    "backslash uparrow downarrow Uparrow Downarrow updownarrow lbrace rbrace "
    "lbrack rbrack lgroup rgroup lmoustache rmoustache"
)
_DELIMITER = re.compile(
    r"[ \t]*(?:\\[{}|]|\\(?:"
    + "|".join(_DELIMITER_WORDS.split())
    + r")(?![A-Za-z])|[()\[\]|./<>])"
)
_HYPHENATED = "|".join(re.escape(name) for name in NAMES if "-" in name)

TOKEN = re.compile(
    "|".join(
        (
            r"([ \t]+)",
            r"(\\[A-Za-z]+)",
            rf"({MARKS}[0-9]+{END})",
            r"(\\[^A-Za-z\n$])",
            rf"((?:{_HYPHENATED})(?![A-Za-z]))",
            r"([A-Za-z]+)",
            r"([0-9]+(?:\.[0-9]+)?)",
            r"([.,;:?!])",
            r"([=<>+\-*/^_|'()\[\]≤≥≠≈±×÷])",
        )
    )
)
WS, WORD, MARK, _ESCAPE, NAME, LETTERS, NUMBER, PUNCT, OPERATOR = range(1, 10)

BINARY = frozenset("=<>/≤≥≠≈×÷,;:")
SIGNS = frozenset("+-±")
BINDING = frozenset("^_*'")
DANGLING = frozenset("^_*")
BRACKETS = frozenset("()[]")
RELATIONS = frozenset("=<>+-±/≤≥≠≈×÷")
COMES_AFTER = frozenset(("binary", "sign", "bind", "infix", "func", "(", "["))
BINDS_TO = re.compile(rf"[A-Za-z0-9(\[{GROUP}{PLAIN}{ENVIRONMENT}]|\\[A-Za-z]")
COMMAND_IN = re.compile(rf"\\(?!q?quad(?![A-Za-z]))[A-Za-z]|{ENVIRONMENT}")
_BACKSLASH_WORD = re.compile(r"\\([A-Za-z]+)")
PROSE_AFTER = re.compile(r"[ \t]+[A-Za-z]{2,}")
ONLY_ENVIRONMENT = re.compile(rf"{ENVIRONMENT}[0-9]+{END}")
PADDED = re.compile(r"([ \t\r\n]*)(.*?)([ \t\r\n]*)", re.DOTALL)


def restore(text: str, store: list[str]) -> str:
    """The text with each group and environment put back; a group may hold an
    environment, which holds neither."""
    while True:
        restored = _SENTINEL.sub(lambda m: store[int(m.group(0)[1:-1])], text)
        if restored == text:
            return text
        text = restored


def is_digit(char: str) -> bool:
    return len(char) == 1 and "0" <= char <= "9"


PARTNER = {"(": ")", ")": "(", "[": "]", "]": "["}


def _plain_edge(kind: int, word: str) -> str:
    """The edge of a token that is no backslash word."""
    if kind == LETTERS:
        return "letter" if len(word) == 1 else ""
    if kind in (OPERATOR, PUNCT):
        if word in BINARY:
            return "binary"
        if word in SIGNS:
            return "sign"
        if word in DANGLING:
            return "bind"
        return word if word in BRACKETS else ""
    return ""


def _word_edge(name: str, role: str) -> str:
    for edge, words in (
        ("needs", _NEEDS_SET),
        ("func", _FUNCTION_SET),
        ("infix", INFIX_SET),
    ):
        if name in words:
            return edge
    return "spacing" if role == "spacing" else ""


def _group_role(inside: str) -> str:
    """A braced group has the role of the backslash words in it: a command it
    does not know poisons it, one it knows makes it a formula."""
    words = _BACKSLASH_WORD.findall(inside)
    if any(word not in _COMMAND_SET for word in words):
        return "poison"
    return "command" if any(word not in _SPACING for word in words) else "math"


def read(
    text: str, token: re.Match, restore_group: Callable[[str], str]
) -> tuple[int, int, str, str]:
    """The end of the token with what belongs to it, the change in bracket
    depth, its role ("command", "poison" or "math") and its edge."""
    kind, word, end = token.lastindex, token.group(0), token.end()
    if kind == WORD:
        name = word[1:]
        if name in _OPENING | _CLOSING | _SIZED:
            delimiter = _DELIMITER.match(text, end)
            if delimiter:
                if name in _OPENING:
                    return delimiter.end(), 1, "command", "("
                if name in _CLOSING:
                    return delimiter.end(), -1, "command", ")"
                return delimiter.end(), 0, "command", "infix"
        if name in _OPENS:
            return end, 1, "command", "("
        if name in _CLOSES:
            return end, -1, "command", ")"
        if name in _SPACING:
            return end, 0, "spacing", "spacing"
        role = "command" if name in _COMMAND_SET else "poison"
        return end, 0, role, _word_edge(name, role)
    if kind == MARK:
        if word[0] == GROUP:
            return end, 0, _group_role(restore_group(word)), ""
        return end, 0, "poison" if word[0] == PLAIN else "command", ""
    if kind == OPERATOR:
        change = 1 if word in "([" else -1 if word in ")]" else 0
        return end, change, "math", _plain_edge(kind, word)
    return end, 0, "math", _plain_edge(kind, word)
