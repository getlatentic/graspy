// Display maths that runs over several lines, laid out so remark-math reads it.
//
// remark-math reads `$$` as display maths only when it begins a line (inside a
// list item, a block quote, its container's indent). `text \[` newline ... `\]`
// makes `text $$` newline ... `$$`, which it does not read: a literal `$$` shows
// and the prose after it is set as maths. So a display span that opens after
// text on its line is moved onto lines of its own, and text that follows its
// closer goes on a line of its own. A span written on one line, in a sentence,
// stays inline maths, and a table row is left alone.
//
// This is apps/server/src/app/domains/lesson/maths_display.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-display.ts is this file's twin.

// What a line begins with that is not its text: block quotes, indent, a list
// item's marker. A line inside a container goes on with the same prefix.
const CONTAINER = /^((?:[ \t]*>)+[ \t]?)?([ \t]*)((?:[-*+]|[0-9]+[.)])[ \t]+)?/;
const BLANK_CHARS = /[^ \t\r\n\f\v]/;
const isBlank = (text: string) => !BLANK_CHARS.test(text);
const trimEnd = (text: string) => text.replace(/[ \t]+$/, "");
const trimStart = (text: string) => text.replace(/^[ \t]+/, "");

/** The prefix lines that go on from the line carry, and whether any text comes before the span on its line. */
function prefixOf(before: string): [string, boolean] {
  const container = CONTAINER.exec(before)!;
  const [whole, quote = "", indent = "", marker = ""] = container;
  return [quote + indent + " ".repeat(marker.length), !isBlank(before.slice(whole.length))];
}

function lines(maths: string, prefix: string): string {
  const all = maths.split("\n").map(trimEnd);
  while (all.length && isBlank(all[0])) all.shift();
  while (all.length && isBlank(all[all.length - 1])) all.pop();
  const margin = Math.min(
    ...all.filter((line) => !isBlank(line)).map((line) => line.length - trimStart(line).length),
    Infinity,
  );
  const cut = margin === Infinity ? 0 : margin;
  return all.map((line) => (line ? prefix + line.slice(cut) : "")).join("\n");
}

/** For the display span at text[start:end] with several lines: how many spaces to take off the end of the text before it, what to write in its place, and how many spaces to take off the start of the text after it. Null when it stands as it is. */
export function displayLayout(
  text: string,
  start: number,
  end: number,
  maths: string,
): [number, string, number] | null {
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const before = text.slice(lineStart, start);
  const lineEnd = text.indexOf("\n", end);
  const after = text.slice(end, lineEnd < 0 ? text.length : lineEnd);
  const [prefix, midLine] = prefixOf(before);
  const afterText = !isBlank(after);
  if ((!midLine && !afterText) || trimStart(before).startsWith("|")) return null;
  const trailing = midLine ? before.length - trimEnd(before).length : 0;
  const closing = afterText ? `\n${prefix}` : "";
  const written = midLine
    ? `\n${prefix}$$\n${lines(maths, prefix)}\n${prefix}$$`
    : `$$${maths}$$`;
  const skip = afterText ? after.length - trimStart(after).length : 0;
  return [trailing, written + closing, skip];
}

