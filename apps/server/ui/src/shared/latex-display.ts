// Display maths that runs over several lines, laid out so remark-math reads it.
//
// remark-math reads `$$` as display maths only when it begins a line (inside a
// list item, a block quote, its container's indent). `text \[` newline ... `\]`
// makes `text $$` newline ... `$$`, which it does not read: a literal `$$` shows
// and the prose after it is set as maths. So a display span that opens after
// text on its line is moved onto lines of its own, and text that follows its
// closer goes on a line of its own, except a few punctuation marks, which go
// inside the formula since a line cannot begin with them. A span written on one
// line, in a sentence, stays inline maths, as does a span with several lines
// that neither opens at the end of its line nor closes at the start of one. A
// table row and a line indented as code are left alone.
//
// This is apps/server/src/app/domains/lesson/maths_display.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/web/src/lib/latex-display.ts is this file's twin.

// What a line begins with that is not its text: block quotes, indent, a list
// item's marker. A line inside a container goes on with the same prefix.
const CONTAINER = /^((?:[ \t]*>)+[ \t]?)?([ \t]*)((?:[-*+]|[0-9]+[.)])[ \t]+)?/;
const QUOTE_MARK = /^[ \t]*>[ \t]?/;
const PUNCTUATION = ".,;:!?)";
const PUNCTUATION_RUN = 3;

const isBlankChar = (char: string) => " \t\r\n\f\v".includes(char);
const isSpace = (char: string) => char === " " || char === "\t";

function isBlank(text: string): boolean {
  for (let at = 0; at < text.length; at++) if (!isBlankChar(text[at])) return false;
  return true;
}

// Index loops: a regex such as /[ \t]+$/ tries every start of a long run of
// spaces and costs the square of its length.
function trimEnd(text: string, isTrimmed: (char: string) => boolean = isSpace): string {
  let end = text.length;
  while (end > 0 && isTrimmed(text[end - 1])) end--;
  return text.slice(0, end);
}

function trimStart(text: string, isTrimmed: (char: string) => boolean = isSpace): string {
  let start = 0;
  while (start < text.length && isTrimmed(text[start])) start++;
  return text.slice(start);
}

/** The line without the block quote marks its container puts on it. */
function unquoted(line: string, depth: number): string {
  for (let mark = 0; mark < depth; mark++) {
    const found = QUOTE_MARK.exec(line);
    if (!found) break;
    line = line.slice(found[0].length);
  }
  return line;
}

function lines(maths: string, prefix: string, depth: number): string {
  const [first, ...rest] = maths.split("\n");
  const all = [trimStart(first), ...rest.map((line) => unquoted(line, depth))].map((line) => trimEnd(line));
  while (all.length && isBlank(all[0])) all.shift();
  while (all.length && isBlank(all[all.length - 1])) all.pop();
  let margin = Infinity;
  for (const line of all) {
    if (!isBlank(line)) margin = Math.min(margin, line.length - trimStart(line).length);
  }
  const cut = margin === Infinity ? 0 : margin;
  const empty = trimEnd(prefix);
  return all.map((line) => (line ? prefix + line.slice(cut) : empty)).join("\n");
}

/** The marks at the start of the text after a closer that end the sentence the formula is in. */
function punctuationOf(after: string): string {
  let run = 0;
  while (run < Math.min(after.length, PUNCTUATION_RUN) && PUNCTUATION.includes(after[run])) run++;
  return run && (run === after.length || isBlankChar(after[run])) ? after.slice(0, run) : "";
}

/** For the display span at text[start:end] with several lines: how many spaces to take off the end of the text before it, what to write in its place, how many spaces to take off the start of the text after it, and the prefix a display span that comes next on the same line goes on with. The inherited prefix is the one the span before it, whose closer this span follows on its line, has put on that line. Null when it stands as it is. */
export function displayLayout(
  text: string,
  start: number,
  end: number,
  maths: string,
  inherited: string | null = null,
): [number, string, number, string | null] | null {
  const newline = maths.indexOf("\n");
  const closerStartsLine = isBlank(maths.slice(maths.lastIndexOf("\n") + 1));
  if (!(isBlank(maths.slice(0, newline)) || closerStartsLine)) return null;
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const before = inherited === null ? text.slice(lineStart, start) : "";
  const lineEnd = text.indexOf("\n", end);
  const after = text.slice(end, lineEnd < 0 ? text.length : lineEnd);
  const container = CONTAINER.exec(before)!;
  const [whole, quote = "", indent = "", marker = ""] = container;
  if (trimStart(before).startsWith("|")) return null;
  if (!marker && indent.replaceAll("\t", "    ").length >= 4) return null;
  const midLine = !isBlank(before.slice(whole.length));
  const prefix = inherited ?? quote + indent + " ".repeat(marker.length);
  const lead = after.length - trimStart(after).length;
  const punctuation = punctuationOf(after.slice(lead));
  const remainder = trimStart(after.slice(lead + punctuation.length));
  const afterText = !isBlank(remainder);
  if (!(midLine || afterText || punctuation || inherited !== null)) return null;
  const trailing = midLine ? before.length - trimEnd(before).length : 0;
  const closing = afterText ? `\n${prefix}` : "";
  const skip = afterText || punctuation ? after.length - remainder.length : 0;
  let written: string;
  if (!midLine && closerStartsLine && inherited === null) {
    const body = trimEnd(maths, isBlankChar);
    written = `$$${body}${punctuation}${maths.slice(body.length)}$$`;
  } else {
    const body = lines(maths, prefix, [...prefix].filter((char) => char === ">").length);
    written = `${midLine ? `\n${prefix}` : ""}$$\n${body}${punctuation}\n${prefix}$$`;
  }
  return [trailing, written + closing, skip, afterText ? prefix : null];
}
