// Where a paragraph begins, and whether the paragraph an indent follows is a
// list item's: an indent after a list item is a paragraph of the item, not
// code.
//
// This is apps/server/src/app/domains/lesson/maths_layout.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-layout.ts is this file's twin.

const LIST_ITEM = /^[ \t]*(?:[-*+]|[0-9]+[.)])[ \t]/;
const BLANK_CHARS = /[^ \t\r\n\f\v]/;

export const isBlank = (text: string) => !BLANK_CHARS.test(text);

const lineStartBefore = (text: string, cursor: number) =>
  cursor <= 0 ? 0 : text.lastIndexOf("\n", cursor - 1) + 1;

/** Where the paragraph whose last line ends at `end` begins. */
export function blockStart(text: string, end: number): number {
  let start = end;
  let cursor = end;
  for (let step = 0; step < 200; step++) {
    const lineStart = lineStartBefore(text, cursor);
    if (isBlank(text.slice(lineStart, cursor))) break;
    start = lineStart;
    if (lineStart === 0) break;
    cursor = lineStart - 1;
  }
  return start;
}

/** Where the last line of the paragraph before the one at `start` ends, or -1. */
export function previousBlockEnd(text: string, start: number): number {
  let cursor = start - 1;
  while (cursor > 0) {
    const lineStart = lineStartBefore(text, cursor);
    if (!isBlank(text.slice(lineStart, cursor))) return cursor;
    cursor = lineStart - 1;
  }
  return -1;
}

/** Whether the paragraph before the blank line at `blank` is a list item, or the indented continuation of one. Each paragraph is decided once, in `inList`. */
export function precededByListItem(
  text: string,
  blank: number,
  inList: Map<number, boolean>,
): boolean {
  const chain: number[] = [];
  let result = false;
  // Blank lines may come between the item and the indent.
  let end = previousBlockEnd(text, blank + 1);
  while (end >= 0) {
    const start = blockStart(text, end);
    if (start === end) break;
    const known = inList.get(start);
    if (known !== undefined) {
      result = known;
      break;
    }
    chain.push(start);
    const lineEnd = text.indexOf("\n", start);
    const first = text.slice(start, lineEnd < 0 || lineEnd >= end ? end : lineEnd);
    if (LIST_ITEM.test(first)) {
      result = true;
      break;
    }
    if (!first.startsWith(" ") && !first.startsWith("\t")) break;
    end = previousBlockEnd(text, start);
  }
  for (const start of chain) inList.set(start, result);
  return result;
}

/** The end of the indented lines that go on from the one at `after`. */
export function indentedEnd(text: string, after: number): number {
  let lineEnd = text.indexOf("\n", after);
  while (
    lineEnd >= 0 &&
    (text.startsWith("    ", lineEnd + 1) || text.startsWith("\t", lineEnd + 1))
  ) {
    lineEnd = text.indexOf("\n", lineEnd + 1);
  }
  return lineEnd < 0 ? text.length : lineEnd;
}
