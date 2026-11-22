// The tutor's maths as remark-math reads it: every delimiter made a tag, and
// maths the model wrote with no delimiters tagged too. This is the rule of
// apps/server/src/app/domains/lesson/maths.py (repair_reply), applied to text
// that never passed through it: lessons stored before it, replies still
// streaming. tests/fixtures/math-repair.json holds the cases both must agree
// on. apps/server/ui/src/shared/latex.ts is this file's twin.
//
// Left to the server because they repair a lesson's JSON fields only: @@ for a
// backslash, control characters and doubled backslashes, a list of letters
// kept as text, and the tikz fence. A chat answer is plain text.
//
// Code is never touched: fenced and indented blocks and inline code. No span
// of maths runs over a blank line or past MAX_SPAN characters, which also
// bounds the work of each scan.

const MAX_SPAN = 3000;
// An environment is tried at every \begin, so its bound is tighter.
const MAX_ENVIRONMENT = 1000;

const OPENER = new RegExp(
  [
    String.raw`<latex-(block|inline)>`,
    "```",
    "~~~",
    "`",
    String.raw`\\begin\{tikzpicture\}`,
    // Indented code follows a blank line, and is not a list item's continuation.
    String.raw`(?:^|\n[ \t]*\n)(?: {4}|\t)(?![ \t]*(?:[-*+]|\d+[.)])[ \t])`,
  ].join("|"),
  "g",
);

function boundedFind(text: string, needle: string, start: number): number {
  const at = text
    .slice(start, start + MAX_SPAN + needle.length)
    .indexOf(needle);
  return at < 0 ? -1 : start + at;
}

/** Where the span the opener begins ends, or null when it never closes. */
function spanEnd(text: string, opener: RegExpExecArray): number | null {
  const kind = opener[0];
  const after = OPENER.lastIndex;
  if (kind.startsWith("<latex-")) {
    const close = `</latex-${opener[1]}>`;
    const end = boundedFind(text, close, after);
    return end < 0 ? null : end + close.length;
  }
  if (kind === "```" || kind === "~~~") {
    // An unclosed fence is a block still being written: code to the end.
    const end = text.indexOf(kind, after);
    return end < 0 ? text.length : end + kind.length;
  }
  if (kind === "`") {
    const end = text.indexOf("`", after);
    if (end < 0 || text.slice(after, end).includes("\n")) return null;
    return end + 1;
  }
  if (kind.startsWith("\\begin")) {
    const close = "\\end{tikzpicture}";
    const end = text.indexOf(close, after);
    return end < 0 ? null : end + close.length;
  }
  return indentedBlockEnd(text, after);
}

function indentedBlockEnd(text: string, after: number): number {
  let lineEnd = text.indexOf("\n", after);
  while (
    lineEnd >= 0 &&
    (text.startsWith("    ", lineEnd + 1) || text.startsWith("\t", lineEnd + 1))
  ) {
    lineEnd = text.indexOf("\n", lineEnd + 1);
  }
  return lineEnd < 0 ? text.length : lineEnd;
}

/** The text with `rewrite` applied to everything but the code, TikZ and maths already tagged in it. */
function mapUnprotected(
  text: string,
  rewrite: (part: string) => string,
): string {
  const pieces: string[] = [];
  let done = 0;
  let search = 0;
  for (;;) {
    OPENER.lastIndex = search;
    const opener = OPENER.exec(text);
    if (!opener) break;
    const end = spanEnd(text, opener);
    if (end === null) {
      search = OPENER.lastIndex;
      continue;
    }
    pieces.push(
      rewrite(text.slice(done, opener.index)),
      text.slice(opener.index, end),
    );
    done = search = end;
  }
  pieces.push(rewrite(text.slice(done)));
  return pieces.join("");
}

const TAG = /<latex-(block|inline)>/g;

/** The text with `rewrite` applied to the inside of each tagged span. */
function mapMaths(text: string, rewrite: (maths: string) => string): string {
  const pieces: string[] = [];
  let done = 0;
  for (;;) {
    TAG.lastIndex = done;
    const opener = TAG.exec(text);
    if (!opener) break;
    const after = TAG.lastIndex;
    const end = boundedFind(text, `</latex-${opener[1]}>`, after);
    pieces.push(text.slice(done, after));
    done = after;
    if (end >= 0) {
      pieces.push(rewrite(text.slice(after, end)));
      done = end;
    }
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

// \[ opens display maths unless it is the length of a line break, as in
// \\[4pt]. The units are TeX's and KaTeX's.
const LENGTH_UNITS = "pt|pc|bp|dd|cc|sp|mm|cm|in|em|ex|mu|px|nd|nc";
const LENGTH = String.raw`\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*(?:${LENGTH_UNITS})\s*\]`;
const LENGTH_AT = new RegExp(LENGTH, "y");

// A doubled backslash is a line break and never opens a delimiter, so \\[note]
// is not one. $$ before $, so a display span is not read as two inline ones.
const DELIMITER = /\\\\|\\\$|\$\$|\$|\\\[|\\\(/g;
const CLOSERS: Record<string, string> = {
  $$: "$$",
  "\\[": "\\]",
  "\\(": "\\)",
  $: "$",
};
const BLANK_LINE = /\n[ \t]*\n/;

/** The end of the closing delimiter and the tag the span takes, or null when the opener opens no span. */
function delimited(
  text: string,
  opener: string,
  after: number,
): [number, "block" | "inline"] | null {
  if (opener === "\\[") {
    LENGTH_AT.lastIndex = after;
    if (LENGTH_AT.test(text)) return null;
  }
  const closer = CLOSERS[opener];
  const end = boundedFind(text, closer, after);
  if (end < 0 || BLANK_LINE.test(text.slice(after, end))) return null;
  if (opener === "$") {
    // Money in a word problem is two dollar signs in one sentence, so a bare
    // pair is not enough to mean maths: the span must not open or close on
    // whitespace, and a digit after the closing $ means it was a price.
    const maths = text.slice(after, end);
    if (!maths || /\s/.test(maths[0]) || /\s/.test(maths[maths.length - 1])) {
      return null;
    }
    if (/\d/.test(text.charAt(end + 1))) return null;
  }
  return [
    end + closer.length,
    opener === "$$" || opener === "\\[" ? "block" : "inline",
  ];
}

function tagDelimitedIn(text: string): string {
  const pieces: string[] = [];
  let done = 0;
  let search = 0;
  for (;;) {
    DELIMITER.lastIndex = search;
    const found = DELIMITER.exec(text);
    if (!found) break;
    const opener = found[0];
    const after = DELIMITER.lastIndex;
    if (opener === "\\\\" || opener === "\\$") {
      search = after;
      continue;
    }
    const span = delimited(text, opener, after);
    if (span === null) {
      search = found.index + 1;
      continue;
    }
    const [end, tag] = span;
    const maths = text.slice(after, end - CLOSERS[opener].length);
    pieces.push(
      text.slice(done, found.index),
      `<latex-${tag}>${maths}</latex-${tag}>`,
    );
    done = search = end;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

function tagDelimiters(text: string): string {
  return mapUnprotected(text, tagDelimitedIn);
}

// Text-mode LaTeX for letters used in phonetics. Outside a maths span nothing
// renders them, and the learner would read "/\ae/" where the model means /æ/.
const TEXT_COMMANDS: Record<string, string> = {
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  OE: "Œ",
  ss: "ß",
  o: "ø",
  O: "Ø",
};

function phoneticLetters(text: string): string {
  return text.replace(
    /\\(ae|AE|oe|OE|ss|o|O)(?![A-Za-z])/g,
    (_command, letters: string) => TEXT_COMMANDS[letters],
  );
}

// A run is joined items, linked by an operator: a command with its arguments,
// a math environment, a braced or parenthesised group, a single letter, a
// number, or a name that a relation follows (`df =`). Words of prose join
// nothing, so "the sum - \sqrt{2}" keeps "the sum". A run with no command or
// environment in it is plain text.
const BRACED_1 = String.raw`\{[^{}]{0,200}\}`;
const BRACED_2 = String.raw`\{(?:[^{}]|${BRACED_1}){0,200}\}`;
const BRACED = String.raw`\{(?:[^{}]|${BRACED_2}){0,200}\}`;
// \qquad and \quad join the items either side of them, like an operator.
const COMMAND = String.raw`\\(?!begin\b|end\b|q?quad\b)[A-Za-z]+(?:${BRACED}|\d+)*`;
// align and gather are display-only, which KaTeX refuses inside a line of text.
const ENVIRONMENTS = [
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "array",
  "aligned",
  "alignedat",
  "gathered",
  "cases",
  "align",
  "align*",
  "gather",
  "gather*",
];
const IN_SPAN = String.raw`(?:[^\n]|\n(?![ \t]*\n))`;
const escaped = (name: string) => name.replace("*", String.raw`\*`);
const ENVIRONMENT = ENVIRONMENTS.map(
  (name) =>
    String.raw`\\begin\{${escaped(name)}\}${IN_SPAN}{0,${MAX_ENVIRONMENT}}?\\end\{${escaped(name)}\}`,
).join("|");
const PAREN = String.raw`\((?:\\[A-Za-z]+|[A-Za-z](?![A-Za-z])|[^A-Za-z()\n\\]){1,60}\)`;
const RELATION = "[=<>≤≥≠≈]";
const SHORT = String.raw`(?:[A-Za-z](?![A-Za-z])|\d+(?:\.\d+)?)`;
const NAME = String.raw`[A-Za-z]{2,}(?![A-Za-z])(?=[ \t]*${RELATION})`;
const COMMANDS = String.raw`(?:${ENVIRONMENT}|${COMMAND})(?:[ \t]*(?:${ENVIRONMENT}|${COMMAND}))*`;
const ITEM = `(?:${COMMANDS}|${BRACED}|${PAREN}|${SHORT}|${NAME})+`;
const OPERATOR = String.raw`[ \t]*(?:[+\-/^_±×÷]|${RELATION}|\\q?quad(?![A-Za-z])|\\[,;])[ \t]*`;
// A word that is no item is taken whole, so no run starts in the middle of it.
const RUN = new RegExp(`${ITEM}(?:${OPERATOR}${ITEM})*|[A-Za-z]+`, "g");

const HAS_COMMAND = /\\(?!q?quad\b)[A-Za-z]/;
const PAREN_GROUP = new RegExp(`^${PAREN}$`);

function tagRun(run: string): string {
  if (!HAS_COMMAND.test(run)) return run;
  if (PAREN_GROUP.test(run)) {
    // A group of parentheses alone is punctuation round the maths.
    const [, before, maths, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(
      run.slice(1, -1),
    )!;
    return `(${before}<latex-inline>${maths}</latex-inline>${after})`;
  }
  return `<latex-inline>${run}</latex-inline>`;
}

function tagBareMaths(text: string): string {
  return mapUnprotected(text, (part) => part.replace(RUN, tagRun));
}

const DISPLAY_ONLY = /\\(begin|end)\{(align|gather)\*?\}/g;
// A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
// the whole formula as source. \_ is the underscore itself.
const BLANK = /\\_|_{2,}/g;

function inlineMaths(maths: string): string {
  return maths
    .replace(DISPLAY_ONLY, "\\$1{$2ed}")
    .replace(BLANK, (run) => (run === "\\_" ? run : "\\_".repeat(run.length)));
}

function tagUndelimited(text: string): string {
  return mapMaths(
    tagBareMaths(mapUnprotected(text, phoneticLetters)),
    inlineMaths,
  );
}

/** Rewrites the tutor's maths, however delimited or not, into the $$ and $ that remark-math reads. */
export function processLatex(content: string): string {
  if (!content) return content;
  return tagUndelimited(tagDelimiters(content))
    .replace(/<\/?latex-block>/g, "$$$$")
    .replace(/<\/?latex-inline>/g, "$");
}
