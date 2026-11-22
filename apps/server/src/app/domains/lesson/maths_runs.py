r"""Maths the model wrote with no delimiters: ``\begin{pmatrix}...\end{pmatrix}``,
``\bar{x} = \underline{...} \qquad s = ...``. Each such run is tagged as one
<latex-inline>.

A run is items linked by an operator (`=`, `+`, `-`, `\qquad` ...): a command
KaTeX knows with its arguments, a math environment, a braced or parenthesised
group, a single letter, a number, or a name that a relation follows (`df =`).
Words of prose join nothing, so "the sum - \sqrt{2}" keeps "the sum". A
backslash word that is not in COMMANDS is a path, a regex or an escape, and with
everything attached to it is text. A run with no command or environment in it
is text too.

Environments and braced groups are found first, by search, and stand in the
text as one private-use character each, so a regex never counts their
contents; one that is over its cap or crosses a blank line is a plain word,
and a run beside it is left untagged, never split.

apps/web/src/lib/latex-runs.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases, and the vocabulary, both must
agree on.
"""

import re

from .maths_scan import MAX_DISPLAY, MAX_INLINE, Searcher, map_unprotected

_COMMAND_WORDS = (
    # Greek
    "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa "
    "lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi "
    "psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega "
    "eth hbar ell aleph Re Im wp "
    # operators and functions
    "frac dfrac tfrac sqrt sum prod int iint oint lim limsup liminf sup inf max min "
    "log ln lg exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth "
    "det gcd lcm arg deg dim ker mod bmod pmod Pr binom choose over "
    # symbols and relations
    "cdot cdots ldots dots vdots ddots times div pm mp ast star circ bullet oplus "
    "otimes leq geq neq le ge ne ll gg approx equiv sim simeq cong propto infty "
    "partial nabla forall exists nexists in notin ni subset subseteq supset supseteq "
    "cup cap setminus emptyset varnothing to gets rightarrow leftarrow leftrightarrow "
    "Rightarrow Leftarrow Leftrightarrow longrightarrow longleftarrow mapsto implies "
    "impliedby iff therefore because angle perp parallel mid nmid triangle square "
    "degree prime neg land lor wedge vee not colon "
    # text, fonts, accents, spacing and sizing
    "text textbf textit textrm mathbf mathbb mathcal mathrm mathit mathsf mathtt "
    "boldsymbol operatorname bar overline underline hat widehat tilde widetilde vec "
    "dot ddot overrightarrow overbrace underbrace phantom hphantom vphantom cancel "
    "boxed left right big Big bigg Bigg langle rangle lfloor rfloor lceil rceil vert "
    "Vert lvert rvert lVert rVert displaystyle textstyle scriptstyle limits nolimits "
    "stackrel overset underset xrightarrow xleftarrow substack"
)
COMMANDS = _COMMAND_WORDS.split()

# A function or operator name, or a capital Greek letter, takes the single
# letter or number after a space: `\sin x`, `\Delta E`.
_FUNCTION_WORDS = (
    "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim "
    "max min sup inf det arg Delta nabla partial Gamma Theta Lambda Xi Pi Sigma "
    "Upsilon Phi Psi Omega"
)
FUNCTIONS = _FUNCTION_WORDS.split()

# A name, not a word of prose, before a relation: `df = n - 1`.
_NAME_WORDS = (
    "p-value df dx dy dz dt ds SE SD CI Var Cov Corr Pr det rank dim gcd lcm erf sgn"
)
NAMES = _NAME_WORDS.split()

# align and gather are display-only, which KaTeX refuses inside a line of text.
_ENVIRONMENT_WORDS = (
    "matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix array aligned "
    "alignedat gathered cases align align* gather gather*"
)
ENVIRONMENTS = _ENVIRONMENT_WORDS.split()

_GROUP, _PLAIN, _ENVIRONMENT, _END = "\ue000", "\ue002", "\ue004", "\ue001"
_SENTINEL_MARKS = f"[{_GROUP}{_PLAIN}{_ENVIRONMENT}]"
_SENTINEL = re.compile(rf"{_SENTINEL_MARKS}[0-9]+{_END}")


def _alternatives(words: list[str]) -> str:
    return "|".join(re.escape(word) for word in words)


def _marked(mark: str) -> str:
    return rf"{mark}[0-9]+{_END}"


_G, _P, _E = _marked(_GROUP), _marked(_PLAIN), _marked(_ENVIRONMENT)
_COMMAND = rf"\\(?:{_alternatives(COMMANDS)})(?![A-Za-z])(?:{_G}|[0-9]+)*"
_FUNCTION = (
    rf"\\(?:{_alternatives(FUNCTIONS)})(?![A-Za-z])[ \t]+"
    r"(?:[A-Za-z](?![A-Za-z])|[0-9]+(?:\.[0-9]+)?)"
)
_COMMAND_ATOM = rf"(?:{_E}|{_COMMAND})"
_COMMAND_RUN = rf"{_COMMAND_ATOM}(?:[ \t]*{_COMMAND_ATOM})*"
_PAREN = (
    rf"\((?:\\(?:{_alternatives(COMMANDS)})(?![A-Za-z])"
    r"|[A-Za-z](?![A-Za-z])|[^A-Za-z()\n\\]){1,60}\)"
)
_RELATION = r"[=<>≤≥≠≈]"
_NAME = rf"(?:{_alternatives(NAMES)})(?![A-Za-z0-9_-])(?=[ \t]*{_RELATION})"
_SHORT = r"(?:[A-Za-z](?![A-Za-z])|[0-9]+(?:\.[0-9]+)?)"
_ITEM = rf"(?:{_FUNCTION}|{_COMMAND_RUN}|{_G}|{_PAREN}|{_NAME}|{_SHORT})+"
_OPERATOR = rf"[ \t]*(?:[+\-/^_±×÷]|{_RELATION}|\\q?quad(?![A-Za-z])|\\[,;])[ \t]*"
_UNKNOWN = rf"\\[A-Za-z0-9_]*(?:\\[A-Za-z0-9_]*|[A-Za-z0-9_.:\-]+|{_G}|{_P}|{_E})*"
# A word with backslash words attached (`foo\frac12`) is text.
_WORD = r"[A-Za-z]+(?:\\[A-Za-z0-9_]*)*"
# What no run starts in the middle of is taken whole: a backslash word, a plain
# group, a word of prose.
_RUN = re.compile(rf"({_ITEM}(?:{_OPERATOR}{_ITEM})*)|{_UNKNOWN}|{_P}|{_WORD}")

_HAS_COMMAND = re.compile(rf"\\(?!q?quad(?![A-Za-z]))[A-Za-z]|{_ENVIRONMENT}")
_PLAIN_AFTER = re.compile(rf"(?:{_OPERATOR})?{_P}")
_PAREN_GROUP = re.compile(_PAREN)
_PADDED = re.compile(r"(\s*)(.*?)(\s*)", re.DOTALL)
_BEGIN = re.compile(rf"\\begin\{{({_alternatives(ENVIRONMENTS)})\}}")
_BRACE = re.compile(r"\\[\s\S]|[{}]")


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
        mark = _ENVIRONMENT if stop - opener.start() <= MAX_DISPLAY else _PLAIN
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
        mark = _GROUP if end - start <= MAX_INLINE else _PLAIN
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


def _tagged_run(run: re.Match) -> str:
    text = run.group(0)
    if (
        run.group(1) is None
        or not _HAS_COMMAND.search(text)
        or _PLAIN_AFTER.match(run.string, run.end())
    ):
        return text
    if _PAREN_GROUP.fullmatch(text):
        # A group of parentheses alone is punctuation round the maths.
        before, maths, after = _PADDED.fullmatch(text[1:-1]).groups()
        return f"({before}<latex-inline>{maths}</latex-inline>{after})"
    return f"<latex-inline>{text}</latex-inline>"


def _tag_segment(segment: str) -> str:
    if "\\" not in segment or re.search(_SENTINEL_MARKS, segment):
        return segment
    store: list[str] = []
    protected = _protect_groups(_protect_environments(segment, store), store)
    return _restored(_RUN.sub(_tagged_run, protected), store)


def tag_bare_maths(text: str) -> str:
    """Each run of undelimited maths tagged."""
    return map_unprotected(text, _tag_segment)
