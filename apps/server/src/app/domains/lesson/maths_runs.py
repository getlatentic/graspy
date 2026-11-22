r"""Maths the model wrote with no delimiters: ``\begin{pmatrix}...\end{pmatrix}``,
``A = \pi r^2``, ``\frac{d}{dx}\left[ x^2 \right] = 2x``. Each such formula is
tagged as one <latex-inline>.

The text is read token by token. A run is the tokens that can be part of a
formula: commands KaTeX knows, single letters, numbers, names such as `df`,
operators, brackets, and `\left` ... `\right` pairs, with the spaces between
them. A word of prose, a newline, a sentence's closing punctuation (outside
brackets) or any other character ends it. A run that holds a command or an
environment is a formula, and is tagged less its edges: a dangling operator, an
unmatched bracket, a trailing `\qquad`, the punctuation of a sentence.

A backslash word KaTeX does not know (a path, a regex, an escape, a command
this does not list) poisons its run: the whole run is left as text, never
half. So is a run over MAX_INLINE, one that follows a letter with no space
(`Hello\alpha`), and one beside a group over its cap.

Environments and braced groups are found first, by search, and stand in the
text as one private-use character each, so no scan counts their contents.

apps/web/src/lib/latex-runs.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases, and the vocabulary, both must
agree on.
"""

import re

from .maths_scan import MAX_DISPLAY, MAX_INLINE, Searcher, exceeds, map_unprotected
from .maths_vocabulary import COMMANDS, DISPLAY_ONLY_ENVIRONMENTS, ENVIRONMENTS

# A name, not a word of prose, that may stand in a formula: `df = n - 1`.
_NAME_WORDS = "p-value df dx dy dz dt ds dr du dv dw SE SD CI Var Cov Corr Pr det rank dim gcd lcm erf sgn"
NAMES = _NAME_WORDS.split()

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
_BLOCK_ONLY = tuple(
    name
    for name in DISPLAY_ONLY_ENVIRONMENTS
    if name not in RENAMED_ENVIRONMENTS and name not in UNWRAPPED_ENVIRONMENTS
)

_GROUP, _PLAIN, _ENVIRONMENT, _END = "\ue000", "\ue002", "\ue004", "\ue001"
_MARKS = f"[{_GROUP}{_PLAIN}{_ENVIRONMENT}]"
_SENTINEL = re.compile(rf"{_MARKS}[0-9]+{_END}")
_ONLY_ENVIRONMENT = re.compile(rf"{_ENVIRONMENT}[0-9]+{_END}")

_COMMAND_SET = frozenset(COMMANDS)
_NAME_SET = frozenset(NAMES)
_SPACING = frozenset(("quad", "qquad"))
_OPENING = frozenset(("left", "bigl", "Bigl", "biggl", "Biggl"))
_CLOSING = frozenset(("right", "bigr", "Bigr", "biggr", "Biggr"))
_SIZED = frozenset(("middle", "big", "Big", "bigg", "Bigg"))
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

_TOKEN = re.compile(
    "|".join(
        (
            r"([ \t]+)",
            r"(\\[A-Za-z]+)",
            rf"({_MARKS}[0-9]+{_END})",
            r"(\\[^A-Za-z\n$])",
            rf"((?:{_HYPHENATED})(?![A-Za-z]))",
            r"([A-Za-z]+)",
            r"([0-9]+(?:\.[0-9]+)?)",
            r"([.,;:?!])",
            r"([=<>+\-*/^_|'()\[\]≤≥≠≈±×÷])",
        )
    )
)
_WS, _WORD, _MARK, _ESCAPE, _NAME, _LETTERS, _NUMBER, _PUNCT, _OPERATOR = range(1, 10)

# Binary operators and a sentence's punctuation do not begin or end a formula;
# a sign does when it has a space after it. A spacing command at an edge is
# not part of it.
_BINARY = frozenset("=<>/*≤≥≠≈×÷,;:")
_SIGNS = frozenset("+-±")
_OPENERS, _CLOSERS = "([", ")]"
_COMMAND_IN = re.compile(rf"\\(?!q?quad(?![A-Za-z]))[A-Za-z]|{_ENVIRONMENT}")
_BEGIN = re.compile(
    r"\\begin\{(" + "|".join(re.escape(name) for name in ENVIRONMENTS) + r")\}"
)
_BACKSLASH_WORD = re.compile(r"\\([A-Za-z]+)")
_BRACE = re.compile(r"\\[\s\S]|[{}]")
_PADDED = re.compile(r"([ \t\r\n]*)(.*?)([ \t\r\n]*)", re.DOTALL)


def _token(mark: str, store: list[str], text: str) -> str:
    store.append(text)
    return f"{mark}{len(store) - 1}{_END}"


def _protect_environments(text: str, store: list[str]) -> str:
    index = Searcher(text)
    pieces, done, search = [], 0, 0
    while opener := _BEGIN.search(text, search):
        close = f"\\end{{{opener.group(1)}}}"
        end = index.find(close, opener.end(), index.paragraph_end(opener.end()))
        if end == -1:
            search = opener.end()
            continue
        stop = end + len(close)
        mark = (
            _PLAIN if exceeds(text, opener.start(), stop, MAX_DISPLAY) else _ENVIRONMENT
        )
        pieces.append(text[done : opener.start()])
        pieces.append(_token(mark, store, text[opener.start() : stop]))
        done = search = stop
    pieces.append(text[done:])
    return "".join(pieces)


def _outermost_groups(text: str) -> list[tuple[int, int]]:
    index = Searcher(text)
    opened, pairs = [], []
    for brace in _BRACE.finditer(text):
        if brace.group(0) == "{":
            opened.append(brace.start())
        elif brace.group(0) == "}" and opened:
            start = opened.pop()
            if index.paragraph_end(start) >= brace.end():
                pairs.append((start, brace.end()))
    groups, last_end = [], 0
    for start, end in sorted(pairs):
        if start >= last_end:
            groups.append((start, end))
            last_end = end
    return groups


def _protect_groups(text: str, store: list[str]) -> str:
    pieces, done = [], 0
    for start, end in _outermost_groups(text):
        mark = _PLAIN if exceeds(text, start, end, MAX_INLINE) else _GROUP
        pieces.append(text[done:start])
        pieces.append(_token(mark, store, text[start:end]))
        done = end
    pieces.append(text[done:])
    return "".join(pieces)


def _restored(text: str, store: list[str]) -> str:
    # A group may hold an environment, which holds neither.
    while True:
        restored = _SENTINEL.sub(lambda m: store[int(m.group(0)[1:-1])], text)
        if restored == text:
            return text
        text = restored


class _Run:
    """The tokens of a run, each as (start, end, edge): its edge is "binary",
    "sign", "spacing", a bracket, or "" for any other."""

    def __init__(self) -> None:
        self.tokens: list[tuple[int, int, str]] = []
        self.has_command = False
        self.poisoned = False

    @property
    def start(self) -> int:
        return self.tokens[0][0]

    @property
    def end(self) -> int:
        return self.tokens[-1][1]


def _edge(kind: int, word: str, role: str) -> str:
    if kind in (_OPERATOR, _PUNCT):
        if word in _BINARY:
            return "binary"
        return "sign" if word in _SIGNS else word if word in "()[]" else ""
    return "spacing" if role == "spacing" else ""


def _word_token(text: str, word: re.Match) -> tuple[int, int, str]:
    """The end of a backslash word with the delimiter that belongs to it, the
    change in bracket depth, and whether it is a "command", "spacing" or
    "poison" token."""
    name = word.group(0)[1:]
    if name in _OPENING | _CLOSING | _SIZED:
        delimiter = _DELIMITER.match(text, word.end())
        if delimiter:
            change = 1 if name in _OPENING else -1 if name in _CLOSING else 0
            return delimiter.end(), change, "command"
    if name in _SPACING:
        return word.end(), 0, "spacing"
    return word.end(), 0, "command" if name in _COMMAND_SET else "poison"


def _balanced_unwrapped(run: str) -> str | None:
    """The run inside the one pair of parentheses that holds all of it."""
    if not (run.startswith("(") and run.endswith(")")):
        return None
    depth = 0
    for position, char in enumerate(run):
        depth += (char == "(") - (char == ")")
        if depth == 0 and position < len(run) - 1:
            return None
    return run[1:-1]


def _trimmed(tokens: list[tuple[int, int, str]]) -> tuple[int, int] | None:
    """Where the formula in the run begins and ends: tokens at the edges that
    are no part of it are cut."""
    low, high, changed = 0, len(tokens), True
    while changed and low < high:
        changed = False
        spaced = low + 1 < high and tokens[low + 1][0] > tokens[low][1]
        if tokens[low][2] in ("binary", "spacing") or (
            tokens[low][2] == "sign" and spaced
        ):
            low, changed = low + 1, True
        elif tokens[high - 1][2] in ("binary", "sign", "spacing"):
            high, changed = high - 1, True
        for opening, closing in zip(_OPENERS, _CLOSERS):
            edges = [token[2] for token in tokens[low:high]]
            if not edges:
                break
            surplus = edges.count(closing) - edges.count(opening)
            if surplus > 0 and edges[-1] == closing:
                high, changed = high - 1, True
            elif surplus < 0 and edges[0] == opening:
                low, changed = low + 1, True
    return (tokens[low][0], tokens[high - 1][1]) if low < high else None


def _tagged(text: str, run: _Run, store: list[str]) -> str:
    trimmed = _trimmed(run.tokens)
    whole = text[run.start : run.end]
    if trimmed is None:
        return whole
    start, end = trimmed
    chunk = text[start:end]
    plain = _restored(chunk, store)
    if not _COMMAND_IN.search(plain) or exceeds(plain, 0, len(plain), MAX_INLINE):
        return whole
    before, after = text[run.start : start], text[end : run.end]
    if any(f"\\begin{{{name}}}" in plain for name in _BLOCK_ONLY):
        if not _ONLY_ENVIRONMENT.fullmatch(chunk):
            return whole
        return f"{before}<latex-block>{chunk}</latex-block>{after}"
    inner = _balanced_unwrapped(chunk)
    if inner is not None and _COMMAND_IN.search(_restored(inner, store)):
        lead, maths, tail = _PADDED.fullmatch(inner).groups()
        return f"{before}({lead}<latex-inline>{maths}</latex-inline>{tail}){after}"
    return f"{before}<latex-inline>{chunk}</latex-inline>{after}"


def _starts_attached(text: str, run: _Run) -> bool:
    """A command written straight after a letter or digit is a path or an
    escape, not maths: `Hello\\alpha`."""
    before = text[run.start - 1 : run.start] if run.start else ""
    return text[run.start] == "\\" and before.isascii() and before.isalnum()


def _ends_run(token: re.Match, text: str, depth: int) -> bool:
    kind, word = token.lastindex, token.group(0)
    if kind == _LETTERS:
        return len(word) > 1 and word not in _NAME_SET
    if kind == _PUNCT:
        # A sentence's punctuation, outside brackets, is followed by a space.
        following = text[token.end() : token.end() + 1]
        return depth <= 0 and following in ("", " ", "\t", "\r", "\n")
    return False


def _group_role(inside: str) -> str:
    """A braced group has the role of the backslash words in it: a command it
    does not know poisons it, one it knows makes it a formula."""
    words = _BACKSLASH_WORD.findall(inside)
    if any(word not in _COMMAND_SET for word in words):
        return "poison"
    return "command" if any(word not in _SPACING for word in words) else "math"


def _read(text: str, token: re.Match, store: list[str]) -> tuple[int, int, str]:
    """The end of the token with what belongs to it, the change in bracket
    depth, and its role: "command", "poison" or "math"."""
    kind, word = token.lastindex, token.group(0)
    if kind == _WORD:
        return _word_token(text, token)
    if kind == _MARK:
        if word[0] == _GROUP:
            return token.end(), 0, _group_role(_restored(word, store))
        role = {_PLAIN: "poison", _ENVIRONMENT: "command"}[word[0]]
        return token.end(), 0, role
    if kind == _OPERATOR:
        change = 1 if word in "([" else -1 if word in ")]" else 0
        return token.end(), change, "math"
    return token.end(), 0, "math"


def _tag_runs(text: str, store: list[str]) -> str:
    pieces: list[str] = []
    done = position = depth = 0
    run: _Run | None = None

    def finish() -> None:
        nonlocal run, done
        formula = run and run.has_command and not run.poisoned
        if formula and not _starts_attached(text, run):
            pieces.append(text[done : run.start])
            pieces.append(_tagged(text, run, store))
            done = run.end
        run = None

    while position < len(text):
        token = _TOKEN.match(text, position)
        if token and token.lastindex == _WS:
            position = token.end()
        elif token is None or _ends_run(token, text, depth):
            finish()
            depth, position = 0, token.end() if token else position + 1
        else:
            end, change, role = _read(text, token, store)
            run = run or _Run()
            run.tokens.append(
                (position, end, _edge(token.lastindex, token.group(0), role))
            )
            run.has_command = run.has_command or role == "command"
            run.poisoned = run.poisoned or role == "poison"
            depth = max(0, depth + change)
            position = end
    finish()
    pieces.append(text[done:])
    return "".join(pieces)


def _tag_segment(segment: str) -> str:
    if "\\" not in segment or re.search(_MARKS, segment):
        return segment
    store: list[str] = []
    protected = _protect_groups(_protect_environments(segment, store), store)
    return _restored(_tag_runs(protected, store), store)


def tag_bare_maths(text: str) -> str:
    """Each formula written with no delimiters tagged."""
    return map_unprotected(text, _tag_segment)
