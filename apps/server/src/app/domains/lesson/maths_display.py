r"""Display maths that runs over several lines, laid out so remark-math reads it.

remark-math reads `$$` as display maths only when it begins a line (inside a
list item, a block quote, its container's indent). `text \[` newline ... `\]`
makes `text $$` newline ... `$$`, which it does not read: a literal `$$` shows
and the prose after it is set as maths. So a display span that opens after text
on its line is moved onto lines of its own, and text that follows its closer
goes on a line of its own. A span written on one line, in a sentence, stays
inline maths, and a table row is left alone.

apps/web/src/lib/latex-display.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re

# What a line begins with that is not its text: block quotes, indent, a list
# item's marker. A line inside a container goes on with the same prefix.
_CONTAINER = re.compile(r"((?:[ \t]*>)+[ \t]?)?([ \t]*)((?:[-*+]|[0-9]+[.)])[ \t]+)?")
_WHITESPACE = " \t"
_BLANK_CHARS = " \t\r\n\f\v"


def _blank(text: str) -> bool:
    return not text.strip(_BLANK_CHARS)


def _prefix(before: str) -> tuple[str, bool]:
    """The prefix lines that go on from the line carry, and whether any text
    comes before the span on its line."""
    container = _CONTAINER.match(before)
    quote, indent, marker = (group or "" for group in container.groups())
    return quote + indent + " " * len(marker), not _blank(before[container.end() :])


def _lines(maths: str, prefix: str) -> str:
    lines = [line.rstrip(_WHITESPACE) for line in maths.split("\n")]
    while lines and _blank(lines[0]):
        lines.pop(0)
    while lines and _blank(lines[-1]):
        lines.pop()
    margin = min(
        (
            len(line) - len(line.lstrip(_WHITESPACE))
            for line in lines
            if not _blank(line)
        ),
        default=0,
    )
    return "\n".join(prefix + line[margin:] if line else "" for line in lines)


def display_layout(
    text: str, start: int, end: int, maths: str
) -> tuple[int, str, int] | None:
    """For the display span at text[start:end] with several lines: how many
    spaces to take off the end of the text before it, what to write in its
    place, and how many spaces to take off the start of the text after it. None
    when it stands as it is."""
    line_start = text.rfind("\n", 0, start) + 1
    before = text[line_start:start]
    line_end = text.find("\n", end)
    after = text[end : len(text) if line_end == -1 else line_end]
    prefix, mid_line = _prefix(before)
    after_text = not _blank(after)
    if (not mid_line and not after_text) or before.lstrip(_WHITESPACE).startswith("|"):
        return None
    trailing = len(before) - len(before.rstrip(_WHITESPACE)) if mid_line else 0
    closing = f"\n{prefix}" if after_text else ""
    if mid_line:
        written = f"\n{prefix}$$\n{_lines(maths, prefix)}\n{prefix}$$"
    else:
        written = f"$${maths}$$"
    skip = len(after) - len(after.lstrip(_WHITESPACE)) if after_text else 0
    return trailing, written + closing, skip
