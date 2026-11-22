r"""Where a paragraph begins, and whether the paragraph an indent follows is a
list item's: an indent after a list item is a paragraph of the item, not code.

apps/web/src/lib/latex-layout.ts is the same rule, and
tests/fixtures/math-repair.json holds the cases both must agree on.
"""

import re

_LIST_ITEM = re.compile(r"[ \t]*(?:[-*+]|[0-9]+[.)])[ \t]")
_BLANK_CHARS = " \t\r\n\f\v"


def is_blank(text: str) -> bool:
    return not text.strip(_BLANK_CHARS)


def block_start(text: str, end: int) -> int:
    """Where the paragraph whose last line ends at ``end`` begins."""
    start, cursor = end, end
    for _ in range(200):
        line_start = text.rfind("\n", 0, cursor) + 1
        if is_blank(text[line_start:cursor]):
            break
        start = line_start
        if line_start == 0:
            break
        cursor = line_start - 1
    return start


def previous_block_end(text: str, start: int) -> int:
    """Where the last line of the paragraph before the one at ``start`` ends,
    or -1."""
    cursor = start - 1
    while cursor > 0:
        line_start = text.rfind("\n", 0, cursor) + 1
        if not is_blank(text[line_start:cursor]):
            return cursor
        cursor = line_start - 1
    return -1


def preceded_by_list_item(text: str, blank: int, in_list: dict[int, bool]) -> bool:
    """Whether the paragraph before the blank line at ``blank`` is a list item,
    or the indented continuation of one. Each paragraph is decided once, in
    ``in_list``."""
    chain, result = [], False
    # Blank lines may come between the item and the indent.
    end = previous_block_end(text, blank + 1)
    while end >= 0:
        start = block_start(text, end)
        if start == end:
            break
        if start in in_list:
            result = in_list[start]
            break
        chain.append(start)
        line_end = text.find("\n", start, end)
        first = text[start : end if line_end == -1 else line_end]
        if _LIST_ITEM.match(first):
            result = True
            break
        if not first.startswith((" ", "\t")):
            break
        end = previous_block_end(text, start)
    for start in chain:
        in_list[start] = result
    return result


def indented_end(text: str, after: int) -> int:
    """The end of the indented lines that go on from the one at ``after``."""
    line_end = text.find("\n", after)
    while line_end != -1 and text.startswith(("    ", "\t"), line_end + 1):
        line_end = text.find("\n", line_end + 1)
    return len(text) if line_end == -1 else line_end
