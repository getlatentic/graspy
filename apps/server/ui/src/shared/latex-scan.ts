// Where the code and the maths are in a reply, found in one pass.
//
// Protected from every repair: fenced and indented code, inline code, TikZ,
// HTML pre and code, a link's address and a bare URL, maths already tagged, a
// span over its cap, an unclosed tag, and the pieces of a tag a stream was cut
// in. Maths delimiters are found here too, so one rule says what a span is.
// Nothing runs over a blank line, and each closer is searched for within its
// paragraph and cap, with the answer "none from here" remembered, so the work
// grows with the text and not with the text times its openers.
//
// This is apps/server/src/app/domains/lesson/maths_scan.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/web/src/lib/latex-scan.ts is this file's twin.

import { indentedEnd, precededByListItem } from "./latex-layout";

// Inline maths, and display maths, a derivation of many lines.
export const MAX_INLINE = 3000;
export const MAX_DISPLAY = 20000;

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

// A fence may sit in a block quote or be indented within a list item, so what
// comes before it on its line is any run of `>` and spaces.
const FENCE_LINE = String.raw`(?:[ \t]*>)*[ \t]*`;

const OPENER_SOURCE = [
  String.raw`<latex-(block|inline)>`,
  String.raw`</latex-(?:block|inline)>`,
  `(?:^|\\n)${FENCE_LINE}(?:(\`{3,})[^\`\\n]*|(~{3,})[^\\n]*)`,
  String.raw`<(pre|code)(?![A-Za-z0-9])[^>\n]*>`,
  String.raw`\\begin\{tikzpicture\}`,
  // Indented code follows a blank line, and is not an indented fence.
  String.raw`(\n[ \t]*\r?\n(?![ \t]*(?:\`{3,}|~{3,}))(?: {4}|\t))`,
  // It may also follow a heading.
  String.raw`((?:^|\n)[ ]{0,3}#{1,6}(?:[ \t][^\n]*)?\n(?: {4}|\t))`,
  String.raw`https?://[^\s<>)\]]+`,
  String.raw`\]\([^()\s]*\)`,
  String.raw`\\\\|\\\$`,
  String.raw`\$\$|\\\[|\\\(|\$`,
  "(`+)",
  CUT_TAG,
].join("|");
const [TAG, FENCE_BACKTICKS, FENCE_TILDES, HTML, INDENT, HEADING_INDENT, CODE_RUN] =
  [1, 2, 3, 4, 5, 6, 7];

const LENGTH_UNITS = "pt|pc|bp|dd|cc|sp|mm|cm|in|em|ex|mu|px|nd|nc";
// \[ opens display maths unless it is the length of a line break, as in
// \\[4pt]. The units are TeX's and KaTeX's.
export const LENGTH = String.raw`[ \t\r\n]*[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)[ \t\r\n]*(?:${LENGTH_UNITS})[ \t\r\n]*\]`;

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

/** Whether an odd number of backslashes come right before the position. */
export function isEscaped(text: string, position: number): boolean {
  let count = 0;
  while (position - count > 0 && text[position - count - 1] === "\\") count++;
  return count % 2 === 1;
}

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

  /** As find, passing over a closer a backslash escapes. */
  findUnescaped(closer: string, after: number, limit: number): number {
    let end = this.find(closer, after, limit);
    while (end >= 0 && isEscaped(this.text, end)) {
      end = this.find(closer, end + 1, limit);
    }
    return end;
  }
}

function fenceEnd(text: Searcher, opener: RegExpExecArray): number {
  const run = opener[FENCE_BACKTICKS] ?? opener[FENCE_TILDES];
  const closing = new RegExp(
    `\\n${FENCE_LINE}${escapeRegExp(run[0])}{${run.length},}[ \\t]*\\r?(?=\\n|(?![\\s\\S]))`,
    "g",
  );
  closing.lastIndex = opener.index + opener[0].length;
  const found = closing.exec(text.text);
  // An unclosed fence is a block still being written: code to the end.
  return found ? found.index + found[0].length : text.text.length;
}

/** The end of the code span a run of backticks opens: the next run of as many, in the same paragraph. */
function codeSpanEnd(text: Searcher, opener: RegExpExecArray): number | null {
  const run = opener[CODE_RUN];
  const after = opener.index + opener[0].length;
  const limit = text.paragraphEnd(after);
  let at = text.find(run, after, limit);
  while (at >= 0 && text.text.charAt(at + run.length) === "`") {
    while (text.text.charAt(at) === "`") at++;
    at = text.find(run, at, limit);
  }
  return at < 0 ? null : at + run.length;
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
  const end = text.findUnescaped(closer, after, text.paragraphEnd(after));
  if (end < 0) return null;
  const display = opener === "$$" || opener === "\\[";
  const stop = end + closer.length;
  if (end - after > (display ? MAX_DISPLAY : MAX_INLINE)) {
    return span(start, stop, "code");
  }
  if (opener === "$") {
    // Money in a word problem is two dollar signs in one sentence, so a bare
    // pair is not enough to mean maths: the span must not open or close on
    // whitespace, and one that opens on a digit and is followed by another is
    // a price.
    const maths = text.text.slice(after, end);
    if (
      !maths ||
      WHITESPACE.includes(maths[0]) ||
      WHITESPACE.includes(maths[maths.length - 1])
    ) {
      return null;
    }
    const following = text.text.charAt(end + 1);
    if (maths[0] >= "0" && maths[0] <= "9" && following >= "0" && following <= "9") {
      return null;
    }
  }
  const kind = display ? "display" : opener === "$" ? "dollar" : "inline";
  return span(start, stop, kind, [after, end]);
}

function tagSpan(text: Searcher, opener: RegExpExecArray): Span {
  const start = opener.index;
  const after = start + opener[0].length;
  const close = `</latex-${opener[TAG]}>`;
  const limit = text.paragraphEnd(after);
  const end = text.find(close, after, limit);
  // An unclosed tag: the maths is still being written.
  if (end < 0) return span(start, limit, "code");
  const cap = opener[TAG] === "block" ? MAX_DISPLAY : MAX_INLINE;
  const stop = end + close.length;
  if (end - after > cap) return span(start, stop, "code");
  return span(start, stop, "tag", [after, end]);
}

function indented(text: Searcher, opener: RegExpExecArray): Span | null {
  const start = opener.index;
  const after = start + opener[0].length;
  if (opener[INDENT]) {
    if (precededByListItem(text.text, start, text.inList)) return null;
    return span(start, indentedEnd(text.text, after), "code");
  }
  // After a heading: the code begins on the line that follows it.
  const newline = after - (opener[0].endsWith("\t") ? 1 : 4) - 1;
  return span(newline, indentedEnd(text.text, after), "code");
}

function spanAt(text: Searcher, opener: RegExpExecArray): Span | null {
  const source = opener[0];
  const start = opener.index;
  const after = start + source.length;
  if (opener[TAG]) return tagSpan(text, opener);
  if (source.startsWith("<") && !opener[HTML]) return span(start, after, "code");
  if (opener[FENCE_BACKTICKS] || opener[FENCE_TILDES]) {
    return span(start, fenceEnd(text, opener), "code");
  }
  if (opener[HTML]) {
    const close = `</${opener[HTML]}>`;
    const end = text.find(close, after, text.text.length);
    return end < 0 ? null : span(start, end + close.length, "code");
  }
  if (opener[INDENT] || opener[HEADING_INDENT]) return indented(text, opener);
  if (source.startsWith("\\begin")) {
    const close = "\\end{tikzpicture}";
    const end = text.find(close, after, text.text.length);
    return end < 0 ? null : span(start, end + close.length, "tikz");
  }
  if (opener[CODE_RUN]) {
    const end = codeSpanEnd(text, opener);
    return end === null ? null : span(start, end, "code");
  }
  if (source.startsWith("http") || source.startsWith("](")) {
    return span(start, after, "code");
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
      const retry = "$\\".includes(source[0]) && !match[CODE_RUN];
      search = retry ? match.index + 1 : after;
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
      kind === "display" || kind === "inline" || (kind === "dollar" && dollars);
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

/** The text a tagged span is written as: $ pairs that open and close on text. A pair that opens on a digit and is followed by one would be read as a price, so it is written with $$. */
function dollarsFor(maths: string, block: boolean, following: string): [string, string] {
  if (block) return ["$$", maths];
  const trimmed = maths.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (!trimmed) return ["", trimmed];
  const price =
    trimmed[0] >= "0" && trimmed[0] <= "9" && following >= "0" && following <= "9";
  return [price ? "$$" : "$", trimmed];
}

/** Each tagged span written with $ or $$; an unclosed tag is left alone. */
export function tagsAsDollars(text: string): string {
  const pieces: string[] = [];
  let done = 0;
  for (const { start, end, kind, inner } of scan(text)) {
    if (kind !== "tag") continue;
    const block = text.startsWith("<latex-block>", start);
    const [mark, maths] = dollarsFor(
      text.slice(inner[0], inner[1]),
      block,
      text.charAt(end),
    );
    pieces.push(text.slice(done, start), `${mark}${maths}${mark}`);
    done = end;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}
