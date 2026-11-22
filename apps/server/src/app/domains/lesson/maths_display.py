r"""Display maths that runs over several lines, laid out so remark-math reads it.

remark-math reads `$$` as display maths only when it begins a line (inside a
list item, a block quote, its container's indent). `text \[` newline ... `\]`
makes `text $$` newline ... `$$`, which it does not read: a literal `$$` shows
and the prose after it is set as maths. So a display span that opens after text
on its line is moved onto lines of its own, and text that follows its closer
goes on a line of its own, except a few punctuation marks, which go inside the
formula since a line cannot begin with them. A span written on one line, in a
sentence, stays inline maths, as does a span with several lines that neither
opens at the end of its line nor closes at the start of one. A table row and a
line indented as code are left alone.

apps/web/src/lib/latex-display.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re

# What a line begins with that is not its text: block quotes, indent, a list
# item's marker. A line inside a container goes on with the same prefix.
_CONTAINER = re.compile(r"((?:[ \t]*>)+[ \t]?)?([ \t]*)((?:[-*+]|[0-9]+[.)])[ \t]+)?")
_QUOTE_MARK = re.compile(r"[ \t]*>[ \t]?")
_WHITESPACE = " \t"
_BLANK_CHARS = " \t\r\n\f\v"
_PUNCTUATION = ".,;:!?)"
_PUNCTUATION_RUN = 3


def _blank(text: str) -> bool:
    return not text.strip(_BLANK_CHARS)


def _unquoted(line: str, depth: int) -> str:
    """The line without the block quote marks its container puts on it."""
    for _ in range(depth):
        mark = _QUOTE_MARK.match(line)
        if not mark:
            break
        line = line[mark.end() :]
    return line


def _lines(maths: str, prefix: str, depth: int) -> str:
    first, *rest = maths.split("\n")
    lines = [first.strip(_WHITESPACE)]
    lines += [_unquoted(line, depth).rstrip(_WHITESPACE) for line in rest]
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
    empty = prefix.rstrip(_WHITESPACE)
    return "\n".join(prefix + line[margin:] if line else empty for line in lines)


def _punctuation(after: str) -> str:
    """The marks at the start of the text after a closer that end the sentence
    the formula is in."""
    run = 0
    while run < min(len(after), _PUNCTUATION_RUN) and after[run] in _PUNCTUATION:
        run += 1
    if run and (run == len(after) or after[run] in _BLANK_CHARS):
        return after[:run]
    return ""


def display_layout(
    text: str, start: int, end: int, maths: str, inherited: str | None = None
) -> tuple[int, str, int, str | None] | None:
    """For the display span at text[start:end] with several lines: how many
    spaces to take off the end of the text before it, what to write in its
    place, how many spaces to take off the start of the text after it, and the
    prefix a display span that comes next on the same line goes on with. The
    inherited prefix is the one the span before it, whose closer this span
    follows on its line, has put on that line. None when it stands as it
    is."""
    first, _, rest = maths.partition("\n")
    closer_starts_line = _blank(rest.rpartition("\n")[2])
    if not (_blank(first) or closer_starts_line):
        return None
    line_start = text.rfind("\n", 0, start) + 1
    before = "" if inherited is not None else text[line_start:start]
    line_end = text.find("\n", end)
    after = text[end : len(text) if line_end == -1 else line_end]
    container = _CONTAINER.match(before)
    quote, indent, marker = (group or "" for group in container.groups())
    if before.lstrip(_WHITESPACE).startswith("|"):
        return None
    if not marker and len(indent.replace("\t", "    ")) >= 4:
        return None
    mid_line = not _blank(before[container.end() :])
    prefix = quote + indent + " " * len(marker) if inherited is None else inherited
    lead = len(after) - len(after.lstrip(_WHITESPACE))
    punctuation = _punctuation(after[lead:])
    remainder = after[lead + len(punctuation) :].lstrip(_WHITESPACE)
    after_text = not _blank(remainder)
    if not (mid_line or after_text or punctuation or inherited is not None):
        return None
    trailing = len(before) - len(before.rstrip(_WHITESPACE)) if mid_line else 0
    closing = f"\n{prefix}" if after_text else ""
    skip = len(after) - len(remainder) if after_text or punctuation else 0
    if not mid_line and closer_starts_line and inherited is None:
        body = maths.rstrip(_BLANK_CHARS)
        written = f"$${body}{punctuation}{maths[len(body) :]}$$"
    else:
        lines = _lines(maths, prefix, prefix.count(">")) + punctuation
        written = f"\n{prefix}" if mid_line else ""
        written += f"$$\n{lines}\n{prefix}$$"
    return trailing, written + closing, skip, prefix if after_text else None
