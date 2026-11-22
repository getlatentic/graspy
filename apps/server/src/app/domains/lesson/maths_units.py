r"""Units and formulas written as text inside maths, which KaTeX does not read.

In `\text{...}` KaTeX prints `·` as the literal `\cdotp`, and refuses `_`, so
the whole formula shows as source. The characters are moved out of the text:
`\text{N·m}` is `\text{N}\cdot\text{m}`, `\text{OCH_2CH_3}` is
`\text{OCH}_2\text{CH}_3`. A `_` is a subscript only before a digit or a braced
group: `\text{___}` and `\text{foo_bar}` are left as they are. A `·` in maths
outside a text is `\cdot`.

apps/web/src/lib/latex-units.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re

# One level of braces may sit inside the text: \text{NO_{3}}.
_TEXT = re.compile(r"\\text\{((?:[^{}]|\{[^{}]*\})*)\}")
_MOVED = re.compile(r"[\u00b7\u22c5\u00d7\u2212]|[_^](?:\{[^{}]*\}|[0-9]+)")
_SIGNS = {
    "\u00b7": "\\cdot",
    "\u22c5": "\\cdot",
    "\u00d7": "\\times",
    "\u2212": "-",
}
_DOTS = re.compile(r"[\u00b7\u22c5]")
_SCRIPTS = "_^"
# A text with one of these holds a dollar or maths of its own.
_OWN_MATHS = ("\\(", "$", '\\char"24')
# How much of the maths before a text is looked at for a script it ends with.
_LOOKBACK = 40
_ENDS_IN_SCRIPT = re.compile(r"([_^])(?:\{[^{}]{0,30}\}|[A-Za-z0-9])$")


def _script(moved: str) -> str:
    inside = moved[1:]
    if inside.startswith("{") or len(inside) == 1:
        return moved
    return f"{moved[0]}{{{inside}}}"


def _ends_in_script(written: str) -> str:
    """The script mark, _ or ^, that the maths ends in, or an empty string."""
    found = _ENDS_IN_SCRIPT.search(written[-_LOOKBACK:])
    return found.group(1) if found else ""


def _balanced(text: str) -> bool:
    depth = 0
    for char in text:
        depth += (char == "{") - (char == "}")
        if depth < 0:
            return False
    return depth == 0


def _moves(body: str) -> list[re.Match]:
    """What is to move out of the text: a script written after a backslash or
    another script mark is a different thing, and is left."""
    return [
        moved
        for moved in _MOVED.finditer(body)
        if moved.group(0) in _SIGNS
        or moved.start() == 0
        or body[moved.start() - 1] not in "\\" + _SCRIPTS
    ]


def _parts(body: str, context: str) -> list[tuple[str, str]] | None:
    """The text as pairs of text and the character moved out after it, the last
    pair with an empty written part; None when moving would leave a doubled
    script or unbalanced braces, or when the text holds maths of its own, which
    KaTeX reads in a text. The context is the end of the maths before."""
    if any(mark in body for mark in _OWN_MATHS):
        return None
    pairs, done, script = [], 0, _ends_in_script(context)
    for moved in _moves(body):
        text, sign = body[done : moved.start()], moved.group(0)
        mark = sign[0] if sign[0] in _SCRIPTS else ""
        if not _balanced(text) or (mark and mark == (script if not text else "")):
            return None
        pairs.append((text, _SIGNS.get(sign) or _script(sign)))
        script = mark or ""
        done = moved.end()
    tail = body[done:]
    if not pairs or not _balanced(tail):
        return None
    pairs.append((tail, ""))
    return pairs


def _written(pairs: list[tuple[str, str]]) -> str:
    out, after_script = [], False
    for text, moved in pairs:
        if after_script and text.startswith("/"):
            out.append("/")
            text = text[1:]
        if text:
            out.append(f"\\text{{{text}}}")
        out.append(moved)
        after_script = _ends_in_script(moved) != ""
    return "".join(out)


def _text_group(group: re.Match, context: str) -> str:
    """The text with its moved characters written outside it, or as it is when
    that would leave the maths with a doubled script or unbalanced braces."""
    pairs = _parts(group.group(1), context)
    if pairs is None:
        return group.group(0)
    following = group.string[group.end() : group.end() + 1]
    last_text, _ = pairs[-1]
    ended = _ends_in_script(pairs[-2][1]) if len(pairs) > 1 else ""
    if not last_text and ended and following == ended:
        return group.group(0)
    written = _written(pairs)
    # A command followed by a letter would run into it.
    if (
        written.endswith(("\\cdot", "\\times"))
        and following.isascii()
        and following.isalpha()
    ):
        written += " "
    return written


def _dots(maths: str) -> str:
    return _DOTS.sub("\\\\cdot ", maths)


def text_in_maths(maths: str) -> str:
    """The maths with what KaTeX cannot read in its text moved out of it."""
    pieces, done, context = [], 0, ""
    for group in _TEXT.finditer(maths):
        before = _dots(maths[done : group.start()])
        written = _text_group(group, (context + before)[-_LOOKBACK:])
        pieces += [before, written]
        context = (context + before + written)[-_LOOKBACK:]
        done = group.end()
    pieces.append(_dots(maths[done:]))
    return "".join(pieces)
