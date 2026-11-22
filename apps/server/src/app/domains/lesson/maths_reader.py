r"""Reads the formulas in text the model wrote with no maths delimiters.

The text is read token by token. A run is the tokens that can be part of a
formula: commands KaTeX knows, single letters, numbers, names such as `df`,
operators, brackets, and `\left` ... `\right` pairs, with the spaces between
them. A word of prose, a newline, a sentence's closing punctuation (outside
brackets) or any other character ends it, and so does what markdown uses:
`|` (outside brackets and outside a table row), `*` and `_` that do not join
two tokens, `.` and `:` that do not sit between digits. A run that holds a
command or an environment is a formula, and is tagged less its edges: a
dangling operator, an unmatched bracket, a trailing `\qquad`.

A letter that follows a finished term with a space (`\frac12 s`, in Czech "with
a number") is prose unless it touches an operator: `m v^2`, `x = 3`. A letter
that begins a formula is a variable only when an operator follows it.

A backslash word KaTeX does not know (a path, a regex, an escape, a command
this does not list) poisons its run: the whole run is left as text, never
half. So is a run over MAX_INLINE, one that follows a letter with no space
(`Hello\alpha`), one beside a group over its cap, and one that ends in a
command that needs an argument and is followed by a word of prose
(`use \frac for fractions`).

apps/web/src/lib/latex-reader.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases, and the vocabulary, both must
agree on.
"""

import re
from collections.abc import Callable

from .maths_scan import MAX_INLINE, exceeds
from .maths_tokens import (
    BINDING,
    BINDS_TO,
    BLOCK_ONLY,
    COMES_AFTER,
    COMMAND_IN,
    INFIX_SET,
    LETTERS,
    NAME_SET,
    NUMBER,
    ONLY_ENVIRONMENT,
    OPERATOR,
    PADDED,
    PARTNER,
    PROSE_AFTER,
    PUNCT,
    RELATIONS,
    TOKEN,
    WORD,
    WS,
    is_digit,
    read,
)


class _Run:
    """The tokens of a run, each as (start, end, edge): its edge is "binary",
    "sign", "bind", "spacing", "infix", "func", "needs", "letter", a bracket,
    or "" for any other."""

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


class _Lines:
    """Whether the line of a position is a row of a table."""

    def __init__(self, text: str) -> None:
        self._text = text
        self._start = self._end = -1
        self._table = False

    def is_table_row(self, position: int) -> bool:
        if not self._start <= position < self._end:
            self._start = self._text.rfind("\n", 0, position) + 1
            end = self._text.find("\n", position)
            self._end = len(self._text) if end == -1 else end
            line = self._text[self._start : self._end].strip(" \t\r")
            self._table = line.startswith("|") or line.endswith("|")
        return self._table


def _binds(text: str, position: int, token: re.Match, run: _Run | None) -> bool:
    """Whether ^, _, * or ' joins the token before it to the one after it."""
    if run is None or run.end != position:
        return False
    return token.group(0) == "'" or bool(BINDS_TO.match(text, token.end()))


def _ends_run(
    text: str, token: re.Match, depth: int, run: _Run | None, lines: _Lines
) -> bool:
    kind, word, position, end = (
        token.lastindex,
        token.group(0),
        token.start(),
        token.end(),
    )
    if kind == LETTERS:
        return len(word) > 1 and word not in NAME_SET
    if kind == PUNCT and word in ".:":
        return not (
            is_digit(text[position - 1 : position]) and is_digit(text[end : end + 1])
        )
    if kind == PUNCT:
        # A sentence's punctuation, outside brackets, is followed by a space.
        return depth <= 0 and text[end : end + 1] in ("", " ", "\t", "\r", "\n")
    if kind == OPERATOR and word == "|":
        return depth <= 0 or lines.is_table_row(position)
    if kind == OPERATOR and word in BINDING:
        return not _binds(text, position, token, run)
    return False


def _is_label(text: str, position: int, end: int) -> bool:
    """A list's label (`a) `, `1) `) at the start of a line."""
    if text[end : end + 1] != ")" or text[end + 1 : end + 2] not in (" ", "\t"):
        return False
    window = text[max(0, position - 8) : position]
    newline = window.rfind("\n")
    prefix = (
        window[newline + 1 :] if newline >= 0 else (window if position <= 8 else "x")
    )
    return not prefix.strip(" \t")


def _letter_joins(text: str, position: int, run: _Run | None) -> tuple[bool, int]:
    """Whether the letters from ``position`` belong to the run, and where they
    end. A letter after an operator belongs. After a finished term it belongs
    when it touches an operator, and a formula begins with a letter only when an
    operator follows."""
    last_end = position
    cursor, count = position, 0
    while (
        (token := TOKEN.match(text, cursor))
        and token.lastindex == LETTERS
        and len(token.group(0)) == 1
    ):
        count += 1
        last_end = cursor = token.end()
        while text[cursor : cursor + 1] in (" ", "\t"):
            cursor += 1
    follower = TOKEN.match(text, cursor)
    adjacent = cursor == last_end
    word = follower.group(0) if follower else ""
    relation = bool(follower) and (
        (follower.lastindex == OPERATOR and word in RELATIONS)
        or (follower.lastindex == WORD and word[1:] in INFIX_SET)
    )
    binding = (
        adjacent
        and bool(follower)
        and follower.lastindex == OPERATOR
        and word in "^_*'(["
    )
    if run is None:
        return relation or binding, last_end
    exponent = len(run.tokens) > 1 and run.tokens[-2][2] == "bind"
    return (count == 1 and relation) or binding or exponent, last_end


def _unmatched(tokens: list[tuple[int, int, str]]) -> set[int]:
    """The tokens that are a bracket with no partner: a closing one with
    nothing open, an opening one nothing closes."""
    opened: dict[str, list[int]] = {"(": [], "[": []}
    unmatched: set[int] = set()
    for index, (_start, _end, edge) in enumerate(tokens):
        if edge in opened:
            opened[edge].append(index)
        elif edge in (")", "]"):
            waiting = opened[PARTNER[edge]]
            if waiting:
                waiting.pop()
            else:
                unmatched.add(index)
    for waiting in opened.values():
        unmatched.update(waiting)
    return unmatched


def _trimmed(tokens: list[tuple[int, int, str]]) -> tuple[int, int] | None:
    """Which tokens of the run are the formula: those at the edges that are no
    part of it are cut, in one pass over the run."""
    low, high, loose = 0, len(tokens), _unmatched(tokens)
    while low < high:
        first, last = tokens[low][2], tokens[high - 1][2]
        spaced = low + 1 < high and tokens[low + 1][0] > tokens[low][1]
        if (
            first in ("binary", "spacing")
            or (first == "sign" and spaced)
            or low in loose
        ):
            low += 1
        elif last in ("binary", "sign", "spacing", "bind") or high - 1 in loose:
            high -= 1
        else:
            break
    return (low, high) if low < high else None


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


def _starts_attached(text: str, run: _Run) -> bool:
    """A command written straight after a letter or digit is a path or an
    escape, not maths: `Hello\\alpha`."""
    before = text[run.start - 1 : run.start] if run.start else ""
    return text[run.start] == "\\" and before.isascii() and before.isalnum()


def _tagged(text: str, run: _Run, restore_group: Callable[[str], str]) -> str:
    whole = text[run.start : run.end]
    bounds = _trimmed(run.tokens)
    if bounds is None:
        return whole
    low, high = bounds
    start, end = run.tokens[low][0], run.tokens[high - 1][1]
    chunk = text[start:end]
    plain = restore_group(chunk)
    if not COMMAND_IN.search(plain) or exceeds(plain, 0, len(plain), MAX_INLINE):
        return whole
    if run.tokens[high - 1][2] == "needs" and PROSE_AFTER.match(text, end):
        return whole
    before, after = text[run.start : start], text[end : run.end]
    if any(f"\\begin{{{name}}}" in plain for name in BLOCK_ONLY):
        if not ONLY_ENVIRONMENT.fullmatch(chunk):
            return whole
        return f"{before}<latex-block>{chunk}</latex-block>{after}"
    inner = _balanced_unwrapped(chunk)
    if inner is not None and COMMAND_IN.search(restore_group(inner)):
        lead, maths, tail = PADDED.fullmatch(inner).groups()
        return f"{before}({lead}<latex-inline>{maths}</latex-inline>{tail}){after}"
    return f"{before}<latex-inline>{chunk}</latex-inline>{after}"


def _begins_label(text: str, token: re.Match, run: _Run | None) -> bool:
    return (
        run is None
        and token.lastindex in (LETTERS, NUMBER)
        and _is_label(text, token.start(), token.end())
    )


def tag_runs(text: str, restore_group: Callable[[str], str]) -> str:
    """The text with each formula in it tagged. ``restore_group`` puts the
    groups and environments back into a piece of it."""
    pieces: list[str] = []
    done = position = depth = cluster_until = 0
    run: _Run | None = None
    lines = _Lines(text)

    def finish() -> None:
        nonlocal run, done
        formula = run and run.has_command and not run.poisoned
        tagged = (
            formula
            and not _starts_attached(text, run)
            and not exceeds(text, run.start, run.end, MAX_INLINE)
        )
        if tagged:
            pieces.append(text[done : run.start])
            pieces.append(_tagged(text, run, restore_group))
            done = run.end
        run = None

    while position < len(text):
        token = TOKEN.match(text, position)
        if token is None:
            finish()
            depth, position = 0, position + 1
            continue
        if token.lastindex == WS:
            position = token.end()
            continue
        if _ends_run(text, token, depth, run, lines):
            finish()
            depth, position = 0, token.end()
            continue
        if _begins_label(text, token, run):
            position = token.end() + 1
            continue
        joined = run and (run.end == position or run.tokens[-1][2] in COMES_AFTER)
        single = token.lastindex == LETTERS and len(token.group(0)) == 1
        if single and position >= cluster_until and not joined:
            joins, cluster_end = _letter_joins(text, position, run)
            if not joins:
                finish()
                depth, position = 0, cluster_end
                continue
            cluster_until = cluster_end
        end, change, role, edge = read(text, token, restore_group)
        run = run or _Run()
        run.tokens.append((position, end, edge))
        run.has_command = run.has_command or role == "command"
        run.poisoned = run.poisoned or role == "poison"
        depth = max(0, depth + change)
        position = end
    finish()
    pieces.append(text[done:])
    return "".join(pieces)
