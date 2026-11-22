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
_MOVED = re.compile(r"[\u00b7\u22c5\u00d7\u2212]|_(?:\{[^{}]*\}|[0-9]+)")
_SIGNS = {
    "\u00b7": "\\cdot",
    "\u22c5": "\\cdot",
    "\u00d7": "\\times",
    "\u2212": "-",
}
_DOTS = re.compile(r"[\u00b7\u22c5]")


def _subscript(moved: str) -> str:
    inside = moved[1:]
    if inside.startswith("{") or len(inside) == 1:
        return moved
    return f"_{{{inside}}}"


def _text_group(group: re.Match) -> str:
    body = group.group(1)
    pieces, done = [], 0
    for moved in _MOVED.finditer(body):
        pieces.append((body[done : moved.start()], False))
        sign = moved.group(0)
        pieces.append((_SIGNS.get(sign) or _subscript(sign), True))
        done = moved.end()
    if not pieces:
        return group.group(0)
    pieces.append((body[done:], False))
    written = "".join(
        piece if moved else f"\\text{{{piece}}}" if piece else ""
        for piece, moved in pieces
    )
    # A command followed by a letter would run into it.
    following = group.string[group.end() : group.end() + 1]
    if written.endswith(("\\cdot", "\\times")) and following.isalpha():
        written += " "
    return written


def _dots(maths: str) -> str:
    return _DOTS.sub("\\\\cdot ", maths)


def text_in_maths(maths: str) -> str:
    """The maths with what KaTeX cannot read in its text moved out of it."""
    pieces, done = [], 0
    for group in _TEXT.finditer(maths):
        pieces.append(_dots(maths[done : group.start()]))
        pieces.append(_text_group(group))
        done = group.end()
    pieces.append(_dots(maths[done:]))
    return "".join(pieces)
