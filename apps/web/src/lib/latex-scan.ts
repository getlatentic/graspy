// Where the code and the maths are in a reply, found in one pass.
//
// Protected from every repair: fenced and indented code, inline code, TikZ,
// maths already tagged, a span over its cap, an unclosed tag, and the pieces of
// a tag a stream was cut in. Maths delimiters are found here too, so one rule
// says what a span is. Nothing runs over a blank line, and each closer is
// searched for within its paragraph and cap, with the answer "none from here"
// remembered, so the work grows with the text and not with the text times its
// openers.
//
// This is apps/server/src/app/domains/lesson/maths_scan.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-scan.ts is this file's twin.

// Inline maths, and display maths, a derivation of many lines.
export const MAX_INLINE = 3000;
export const MAX_DISPLAY = 20000;

const LIST_ITEM = /^[ \t]*(?:[-*+]|[0-9]+[.)])[ \t]/;

const TAG_PARTS = [
  "<latex-block>",
  "<latex-inline>",
  "</latex-block>",
  "</latex-inline>",
];
const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
// A stream cut in the middle of a tag: every proper start of one, at the end.
const PROPER_STARTS = [
  ...new Set(
    TAG_PARTS.flatMap((part) =>
      Array.from({ length: part.length - 1 }, (_, i) => part.slice(0, i + 1)),
    ),
  ),
].sort((a, b) => b.length - a.length);
const CUT_TAG = `(?:${PROPER_STARTS.map(escapeRegExp).join("|")})(?![\\s\\S])`;

const OPENER_SOURCE = [
  String.raw`<latex-(block|inline)>`,
  String.raw`</latex-(?:block|inline)>`,
  "(?:^|\\n)[ ]{0,3}(?:(`{3,})[^`\\n]*|(~{3,})[^\\n]*)",
  String.raw`\\begin\{tikzpicture\}`,
  // Indented code follows a blank line.
  String.raw`\n[ \t]*\r?\n(?: {4}|\t)`,
  String.raw`\\\\|\\\$`,
  String.raw`\$\$|\\\[|\\\(|\$`,
  "`",
  CUT_TAG,
].join("|");

const LENGTH_UNITS = "pt|pc|bp|dd|cc|sp|mm|cm|in|em|ex|mu|px|nd|nc";
// \[ opens display maths unless it is the length of a line break, as in
// \\[4pt]. The units are TeX's and KaTeX's.
const LENGTH = String.raw`[ \t\r\n]*[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)[ \t\r\n]*(?:${LENGTH_UNITS})[ \t\r\n]*\]`;

const CLOSERS: Record<string, string> = {
  $$: "$$",
  "\\[": "\\]",
  "\\(": "\\)",
  $: "$",
};
const WHITESPACE = " \t\r\n";

/** "code" is left as it is; "tikz" is a picture, left as it is by all but mapTikz; "tag" is maths already tagged; "display", "inline" and "dollar" are delimited spans, with `inner` between the delimiters. */
export interface Span {
  start: number;
  end: number;
  kind: "code" | "tikz" | "tag" | "display" | "inline" | "dollar";
  inner: [number, number];
}

const span = (
  start: number,
  end: number,
  kind: Span["kind"],
  inner: [number, number] = [0, 0],
): Span => ({ start, end, kind, inner });

/** Paragraph ends and closers of one text. */
export class Searcher {
  readonly text: string;
  readonly inList = new Map<number, boolean>();
  private readonly blanks: number[] = [];
  private readonly absent = new Map<string, [number, number]>();

  constructor(text: string) {
    this.text = text;
    for (const blank of text.matchAll(/\n[ \t]*\r?\n/g)) {
      this.blanks.push(blank.index);
    }
  }

  paragraphEnd(after: number): number {
    let low = 0;
    let high = this.blanks.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.blanks[middle] < after) low = middle + 1;
      else high = middle;
    }
    return low < this.blanks.length ? this.blanks[low] : this.text.length;
  }

  /** Where the closer is in [after, limit), or -1. */
  find(closer: string, after: number, limit: number): number {
    const known = this.absent.get(closer);
    if (known && known[0] <= after && limit <= known[1]) return -1;
    const end = this.text.indexOf(closer, after);
    if (end < 0 || end + closer.length > limit) {
      this.absent.set(closer, [after, limit]);
      return -1;
    }
    return end;
  }
}

function fenceEnd(text: Searcher, opener: RegExpExecArray): number {
  const run = opener[2] ?? opener[3];
  const closing = new RegExp(
    `\\n {0,3}${escapeRegExp(run[0])}{${run.length},}[ \\t]*\\r?(?=\\n|(?![\\s\\S]))`,
    "g",
  );
  closing.lastIndex = opener.index + opener[0].length;
  const found = closing.exec(text.text);
  // An unclosed fence is a block still being written: code to the end.
  return found ? found.index + found[0].length : text.text.length;
}

const lineStartBefore = (text: string, cursor: number) =>
  cursor <= 0 ? 0 : text.lastIndexOf("\n", cursor - 1) + 1;

function blockStart(text: string, end: number): number {
  let start = end;
  let cursor = end;
  for (let step = 0; step < 200; step++) {
    const lineStart = lineStartBefore(text, cursor);
    if (!text.slice(lineStart, cursor).trim()) break;
    start = lineStart;
    if (lineStart === 0) break;
    cursor = lineStart - 1;
  }
  return start;
}

function previousBlockEnd(text: string, start: number): number {
  let cursor = start - 1;
  while (cursor > 0) {
    const lineStart = lineStartBefore(text, cursor);
    if (text.slice(lineStart, cursor).trim()) return cursor;
    cursor = lineStart - 1;
  }
  return -1;
}

/** Whether the paragraph before the blank line at `blank` is a list item, or the indented continuation of one: an indent after it is a paragraph of the item, not code. Each paragraph is decided once. */
function precededByListItem(index: Searcher, blank: number): boolean {
  const text = index.text;
  const chain: number[] = [];
  let end = blank;
  let result = false;
  for (;;) {
    const start = blockStart(text, end);
    if (start === end) break;
    const known = index.inList.get(start);
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
    if (end < 0) break;
  }
  for (const start of chain) index.inList.set(start, result);
  return result;
}

function indentedEnd(text: string, after: number): number {
  let lineEnd = text.indexOf("\n", after);
  while (
    lineEnd >= 0 &&
    (text.startsWith("    ", lineEnd + 1) || text.startsWith("\t", lineEnd + 1))
  ) {
    lineEnd = text.indexOf("\n", lineEnd + 1);
  }
  return lineEnd < 0 ? text.length : lineEnd;
}

/** The span the delimiter opens: null when it opens none, "code" when it is longer than its cap, which is then left exactly as it was. */
function delimited(text: Searcher, opener: string, start: number): Span | null {
  const after = start + opener.length;
  if (opener === "\\[") {
    const length = new RegExp(LENGTH, "y");
    length.lastIndex = after;
    if (length.test(text.text)) return null;
  }
  const closer = CLOSERS[opener];
  const end = text.find(closer, after, text.paragraphEnd(after));
  if (end < 0) return null;
  const display = opener === "$$" || opener === "\\[";
  const stop = end + closer.length;
  if (end - after > (display ? MAX_DISPLAY : MAX_INLINE)) {
    return span(start, stop, "code");
  }
  if (opener === "$") {
    // Money in a word problem is two dollar signs in one sentence, so a bare
    // pair is not enough to mean maths: the span must not open or close on
    // whitespace, and a digit after the closing $ means it was a price.
    const maths = text.text.slice(after, end);
    if (
      !maths ||
      WHITESPACE.includes(maths[0]) ||
      WHITESPACE.includes(maths[maths.length - 1])
    ) {
      return null;
    }
    const following = text.text.charAt(end + 1);
    if (following >= "0" && following <= "9") return null;
  }
  const kind = display ? "display" : opener === "$" ? "dollar" : "inline";
  return span(start, stop, kind, [after, end]);
}

function tagSpan(text: Searcher, opener: RegExpExecArray): Span {
  const start = opener.index;
  const after = start + opener[0].length;
  const close = `</latex-${opener[1]}>`;
  const limit = text.paragraphEnd(after);
  const end = text.find(close, after, limit);
  // An unclosed tag: the maths is still being written.
  if (end < 0) return span(start, limit, "code");
  const cap = opener[1] === "block" ? MAX_DISPLAY : MAX_INLINE;
  const stop = end + close.length;
  if (end - after > cap) return span(start, stop, "code");
  return span(start, stop, "tag", [after, end]);
}

function spanAt(text: Searcher, opener: RegExpExecArray): Span | null {
  const source = opener[0];
  const start = opener.index;
  const after = start + source.length;
  if (opener[1]) return tagSpan(text, opener);
  if (source.startsWith("<")) return span(start, after, "code");
  if (opener[2] || opener[3]) return span(start, fenceEnd(text, opener), "code");
  if (source.startsWith("\n")) {
    if (precededByListItem(text, start)) return null;
    return span(start, indentedEnd(text.text, after), "code");
  }
  if (source.startsWith("\\begin")) {
    const close = "\\end{tikzpicture}";
    const end = text.find(close, after, text.text.length);
    return end < 0 ? null : span(start, end + close.length, "tikz");
  }
  if (source === "`") {
    const end = text.text.indexOf("`", after);
    if (end < 0 || text.text.slice(after, end).includes("\n")) return null;
    return span(start, end + 1, "code");
  }
  return delimited(text, source, start);
}

/** The spans of the text, in order. */
export function scan(text: string): Span[] {
  const opener = new RegExp(OPENER_SOURCE, "g");
  const prepared = new Searcher(text);
  const found: Span[] = [];
  let search = 0;
  for (;;) {
    opener.lastIndex = search;
    const match = opener.exec(text);
    if (!match) break;
    const source = match[0];
    const after = match.index + source.length;
    if (source === "\\\\" || source === "\\$") {
      search = after;
      continue;
    }
    const next = spanAt(prepared, match);
    if (next === null) {
      search = "$\\`".includes(source[0]) ? match.index + 1 : after;
      continue;
    }
    found.push(next);
    search = next.end;
  }
  return found;
}

/** The text with `rewrite` applied to everything outside the spans. */
export function mapUnprotected(
  text: string,
  rewrite: (part: string) => string,
): string {
  const pieces: string[] = [];
  let done = 0;
  for (const { start, end } of scan(text)) {
    pieces.push(rewrite(text.slice(done, start)), text.slice(start, end));
    done = end;
  }
  pieces.push(rewrite(text.slice(done)));
  return pieces.join("");
}

/** The text with `rewrite` applied to the inside of each tagged or dollar-delimited span. */
export function mapMaths(
  text: string,
  rewrite: (maths: string) => string,
): string {
  const pieces: string[] = [];
  let done = 0;
  for (const { kind, inner } of scan(text)) {
    if (kind !== "tag" && kind !== "dollar") continue;
    pieces.push(
      text.slice(done, inner[0]),
      rewrite(text.slice(inner[0], inner[1])),
    );
    done = inner[1];
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

/** Every maths delimiter made a tag; a $ pair only when `dollars` says so. */
export function tagDelimiters(text: string, dollars: boolean): string {
  const pieces: string[] = [];
  let done = 0;
  for (const { start, end, kind, inner } of scan(text)) {
    const converted =
      kind === "display" ||
      kind === "inline" ||
      (kind === "dollar" && dollars);
    if (!converted) continue;
    const tag = kind === "display" ? "block" : "inline";
    pieces.push(
      text.slice(done, start),
      `<latex-${tag}>${text.slice(inner[0], inner[1])}</latex-${tag}>`,
    );
    done = end;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

/** Each tagged span written with $ or $$; an unclosed tag is left alone. */
export function tagsAsDollars(text: string): string {
  const pieces: string[] = [];
  let done = 0;
  for (const { start, end, kind, inner } of scan(text)) {
    if (kind !== "tag") continue;
    const mark = text.startsWith("<latex-block>", start) ? "$$" : "$";
    pieces.push(
      text.slice(done, start),
      `${mark}${text.slice(inner[0], inner[1])}${mark}`,
    );
    done = end;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}
