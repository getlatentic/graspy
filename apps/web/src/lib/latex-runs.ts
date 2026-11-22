// Maths the model wrote with no delimiters: \begin{pmatrix}...\end{pmatrix},
// A = \pi r^2, \frac{d}{dx}\left[ x^2 \right] = 2x. Each such formula is tagged
// as one <latex-inline>.
//
// The text is read token by token. A run is the tokens that can be part of a
// formula: commands KaTeX knows, single letters, numbers, names such as `df`,
// operators, brackets, and `\left` ... `\right` pairs, with the spaces between
// them. A word of prose, a newline, a sentence's closing punctuation (outside
// brackets) or any other character ends it. A run that holds a command or an
// environment is a formula, and is tagged less its edges: a dangling operator,
// an unmatched bracket, a trailing `\qquad`, the punctuation of a sentence.
//
// A backslash word KaTeX does not know (a path, a regex, an escape, a command
// this does not list) poisons its run: the whole run is left as text, never
// half. So is a run over MAX_INLINE, one that follows a letter with no space
// (`Hello\alpha`), and one beside a group over its cap.
//
// Environments and braced groups are found first, by search, and stand in the
// text as one private-use character each, so no scan counts their contents.
//
// This is apps/server/src/app/domains/lesson/maths_runs.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases, and the
// vocabulary, both must agree on.
// Twin: apps/server/ui/src/shared/latex-runs.ts.

import { MAX_DISPLAY, MAX_INLINE, Searcher, mapUnprotected } from "./latex-scan";
import {
  COMMANDS,
  DISPLAY_ONLY_ENVIRONMENTS,
  ENVIRONMENTS,
} from "./latex-vocabulary";

export { COMMANDS, DISPLAY_ONLY_ENVIRONMENTS, ENVIRONMENTS };

// A name, not a word of prose, that may stand in a formula: `df = n - 1`.
export const NAMES =
  "p-value df dx dy dz dt ds dr du dv dw SE SD CI Var Cov Corr Pr det rank dim gcd lcm erf sgn".split(
    " ",
  );

// Display-only environments have no inline form, and KaTeX refuses them within
// a line of text: they are written as the form that has one.
export const RENAMED_ENVIRONMENTS: Record<string, string> = {
  align: "aligned",
  "align*": "aligned",
  alignat: "alignedat",
  "alignat*": "alignedat",
  gather: "gathered",
  "gather*": "gathered",
  split: "aligned",
};
export const UNWRAPPED_ENVIRONMENTS = ["equation", "equation*"];
const BLOCK_ONLY = DISPLAY_ONLY_ENVIRONMENTS.filter(
  (name) =>
    !(name in RENAMED_ENVIRONMENTS) && !UNWRAPPED_ENVIRONMENTS.includes(name),
);

const GROUP = "";
const PLAIN = "";
const ENVIRONMENT = "";
const END = "";
const MARKS = `[${GROUP}${PLAIN}${ENVIRONMENT}]`;
const SENTINEL = new RegExp(`${MARKS}[0-9]+${END}`, "g");
const ONLY_ENVIRONMENT = new RegExp(`^${ENVIRONMENT}[0-9]+${END}$`);

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const COMMAND_SET = new Set(COMMANDS);
const NAME_SET = new Set(NAMES);
const SPACING = new Set(["quad", "qquad"]);
const OPENING = new Set(["left", "bigl", "Bigl", "biggl", "Biggl"]);
const CLOSING = new Set(["right", "bigr", "Bigr", "biggr", "Biggr"]);
const SIZED = new Set(["middle", "big", "Big", "bigg", "Bigg"]);
const DELIMITER_WORDS =
  "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil vert Vert " +
  "backslash uparrow downarrow Uparrow Downarrow updownarrow lbrace rbrace " +
  "lbrack rbrack lgroup rgroup lmoustache rmoustache";
const DELIMITER = new RegExp(
  String.raw`[ \t]*(?:\\[{}|]|\\(?:${DELIMITER_WORDS.split(" ").join("|")})(?![A-Za-z])|[()\[\]|./<>])`,
  "y",
);
const HYPHENATED = NAMES.filter((name) => name.includes("-"))
  .map(escapeRegExp)
  .join("|");

const TOKEN_SOURCE = [
  String.raw`([ \t]+)`,
  String.raw`(\\[A-Za-z]+)`,
  `(${MARKS}[0-9]+${END})`,
  String.raw`(\\[^A-Za-z\n$])`,
  `((?:${HYPHENATED})(?![A-Za-z]))`,
  "([A-Za-z]+)",
  String.raw`([0-9]+(?:\.[0-9]+)?)`,
  "([.,;:?!])",
  String.raw`([=<>+\-*/^_|'()\[\]≤≥≠≈±×÷])`,
].join("|");
const [WS, WORD, MARK, , , LETTERS, , PUNCT, OPERATOR] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

// Binary operators and a sentence's punctuation do not begin or end a formula;
// a sign does when it has a space after it. A spacing command at an edge is
// not part of it.
const BINARY = "=<>/*≤≥≠≈×÷,;:";
const SIGNS = "+-±";
const OPENERS = "([";
const CLOSERS = ")]";
const COMMAND_IN = new RegExp(
  String.raw`\\(?!q?quad(?![A-Za-z]))[A-Za-z]|${ENVIRONMENT}`,
);
const BEGIN_SOURCE = String.raw`\\begin\{(${ENVIRONMENTS.map(escapeRegExp).join("|")})\}`;
const BACKSLASH_WORD = /\\([A-Za-z]+)/g;

function token(mark: string, store: string[], text: string): string {
  store.push(text);
  return `${mark}${store.length - 1}${END}`;
}

function protectEnvironments(text: string, store: string[]): string {
  const index = new Searcher(text);
  const begin = new RegExp(BEGIN_SOURCE, "g");
  const pieces: string[] = [];
  let done = 0;
  let search = 0;
  for (;;) {
    begin.lastIndex = search;
    const opener = begin.exec(text);
    if (!opener) break;
    const after = opener.index + opener[0].length;
    const close = `\\end{${opener[1]}}`;
    const end = index.find(close, after, index.paragraphEnd(after));
    if (end < 0) {
      search = after;
      continue;
    }
    const stop = end + close.length;
    const mark = stop - opener.index > MAX_DISPLAY ? PLAIN : ENVIRONMENT;
    pieces.push(
      text.slice(done, opener.index),
      token(mark, store, text.slice(opener.index, stop)),
    );
    done = search = stop;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

function outermostGroups(text: string): [number, number][] {
  const index = new Searcher(text);
  const opened: number[] = [];
  const pairs: [number, number][] = [];
  for (const brace of text.matchAll(/\\[\s\S]|[{}]/g)) {
    if (brace[0] === "{") {
      opened.push(brace.index);
    } else if (brace[0] === "}" && opened.length) {
      const start = opened.pop()!;
      if (index.paragraphEnd(start) >= brace.index + 1) {
        pairs.push([start, brace.index + 1]);
      }
    }
  }
  const groups: [number, number][] = [];
  let lastEnd = 0;
  for (const [start, end] of pairs.sort((a, b) => a[0] - b[0])) {
    if (start >= lastEnd) {
      groups.push([start, end]);
      lastEnd = end;
    }
  }
  return groups;
}

function protectGroups(text: string, store: string[]): string {
  const pieces: string[] = [];
  let done = 0;
  for (const [start, end] of outermostGroups(text)) {
    const mark = end - start > MAX_INLINE ? PLAIN : GROUP;
    pieces.push(text.slice(done, start), token(mark, store, text.slice(start, end)));
    done = end;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

function restored(text: string, store: string[]): string {
  // A group may hold an environment, which holds neither.
  for (;;) {
    const next = text.replace(SENTINEL, (mark) =>
      store[Number(mark.slice(1, -1))],
    );
    if (next === text) return text;
    text = next;
  }
}

type Role = "command" | "poison" | "math";
type Read = [end: number, change: number, role: Role];

/** The end of a backslash word with the delimiter that belongs to it, the change in bracket depth, and its role. */
function wordToken(text: string, word: RegExpExecArray): Read {
  const end = word.index + word[0].length;
  const name = word[0].slice(1);
  if (OPENING.has(name) || CLOSING.has(name) || SIZED.has(name)) {
    DELIMITER.lastIndex = end;
    const delimiter = DELIMITER.exec(text);
    if (delimiter) {
      const change = OPENING.has(name) ? 1 : CLOSING.has(name) ? -1 : 0;
      return [end + delimiter[0].length, change, "command"];
    }
  }
  if (SPACING.has(name)) return [end, 0, "math"];
  return [end, 0, COMMAND_SET.has(name) ? "command" : "poison"];
}

/** A braced group has the role of the backslash words in it: a command it does not know poisons it, one it knows makes it a formula. */
function groupRole(inside: string): Role {
  const names = [...inside.matchAll(BACKSLASH_WORD)].map((m) => m[1]);
  if (names.some((name) => !COMMAND_SET.has(name))) return "poison";
  return names.some((name) => !SPACING.has(name)) ? "command" : "math";
}

function balancedUnwrapped(run: string): string | null {
  if (!(run.startsWith("(") && run.endsWith(")"))) return null;
  let depth = 0;
  for (let position = 0; position < run.length; position++) {
    depth += (run[position] === "(" ? 1 : 0) - (run[position] === ")" ? 1 : 0);
    if (depth === 0 && position < run.length - 1) return null;
  }
  return run.slice(1, -1);
}

/** The tokens of a run, each as [start, end, edge]: its edge is "binary", "sign", "spacing", a bracket, or "" for any other. */
type Edged = [start: number, end: number, edge: string];

interface Run {
  tokens: Edged[];
  hasCommand: boolean;
  poisoned: boolean;
}

function edgeOf(kind: number, word: string, role: Role, spacing: boolean): string {
  if (kind === OPERATOR || kind === PUNCT) {
    if (BINARY.includes(word)) return "binary";
    if (SIGNS.includes(word)) return "sign";
    return "()[]".includes(word) ? word : "";
  }
  return role === "math" && spacing ? "spacing" : "";
}

/** Where the formula in the run begins and ends: tokens at the edges that are no part of it are cut. */
function trimmed(tokens: Edged[]): [number, number] | null {
  let low = 0;
  let high = tokens.length;
  let changed = true;
  while (changed && low < high) {
    changed = false;
    const spaced = low + 1 < high && tokens[low + 1][0] > tokens[low][1];
    const first = tokens[low][2];
    if (first === "binary" || first === "spacing" || (first === "sign" && spaced)) {
      low++;
      changed = true;
    } else if (["binary", "sign", "spacing"].includes(tokens[high - 1][2])) {
      high--;
      changed = true;
    }
    for (let pair = 0; pair < OPENERS.length; pair++) {
      const edges = tokens.slice(low, high).map((token) => token[2]);
      if (!edges.length) break;
      const surplus =
        edges.filter((edge) => edge === CLOSERS[pair]).length -
        edges.filter((edge) => edge === OPENERS[pair]).length;
      if (surplus > 0 && edges[edges.length - 1] === CLOSERS[pair]) {
        high--;
        changed = true;
      } else if (surplus < 0 && edges[0] === OPENERS[pair]) {
        low++;
        changed = true;
      }
    }
  }
  return low < high ? [tokens[low][0], tokens[high - 1][1]] : null;
}

function tagged(text: string, run: Run, store: string[]): string {
  const runStart = run.tokens[0][0];
  const runEnd = run.tokens[run.tokens.length - 1][1];
  const whole = text.slice(runStart, runEnd);
  const bounds = trimmed(run.tokens);
  if (bounds === null) return whole;
  const [start, end] = bounds;
  const chunk = text.slice(start, end);
  const plain = restored(chunk, store);
  if (!COMMAND_IN.test(plain) || plain.length > MAX_INLINE) return whole;
  const before = text.slice(runStart, start);
  const after = text.slice(end, runEnd);
  if (BLOCK_ONLY.some((name) => plain.includes(`\\begin{${name}}`))) {
    if (!ONLY_ENVIRONMENT.test(chunk)) return whole;
    return `${before}<latex-block>${chunk}</latex-block>${after}`;
  }
  const inner = balancedUnwrapped(chunk);
  if (inner !== null && COMMAND_IN.test(restored(inner, store))) {
    const [, lead, maths, tail] = /^([ \t\r\n]*)([\s\S]*?)([ \t\r\n]*)$/.exec(
      inner,
    )!;
    return `${before}(${lead}<latex-inline>${maths}</latex-inline>${tail})${after}`;
  }
  return `${before}<latex-inline>${chunk}</latex-inline>${after}`;
}

/** A command written straight after a letter or digit is a path or an escape, not maths: `Hello\alpha`. */
function startsAttached(text: string, run: Run): boolean {
  const start = run.tokens[0][0];
  return (
    text[start] === "\\" && start > 0 && /[A-Za-z0-9]/.test(text[start - 1])
  );
}

function endsRun(token: RegExpExecArray, kind: number, text: string, depth: number) {
  const word = token[0];
  if (kind === LETTERS) return word.length > 1 && !NAME_SET.has(word);
  if (kind === PUNCT) {
    // A sentence's punctuation, outside brackets, is followed by a space.
    const following = text.charAt(token.index + word.length);
    return depth <= 0 && ["", " ", "\t", "\r", "\n"].includes(following);
  }
  return false;
}

function read(
  text: string,
  token: RegExpExecArray,
  kind: number,
  store: string[],
): Read {
  const word = token[0];
  const end = token.index + word.length;
  if (kind === WORD) return wordToken(text, token);
  if (kind === MARK) {
    if (word[0] === GROUP) return [end, 0, groupRole(restored(word, store))];
    return [end, 0, word[0] === PLAIN ? "poison" : "command"];
  }
  if (kind === OPERATOR) {
    return [end, "([".includes(word) ? 1 : ")]".includes(word) ? -1 : 0, "math"];
  }
  return [end, 0, "math"];
}

function tagRuns(text: string, store: string[]): string {
  const pieces: string[] = [];
  const tokenPattern = new RegExp(TOKEN_SOURCE, "y");
  let done = 0;
  let position = 0;
  let depth = 0;
  let run: Run | null = null;

  const finish = () => {
    if (run && run.hasCommand && !run.poisoned && !startsAttached(text, run)) {
      pieces.push(text.slice(done, run.tokens[0][0]), tagged(text, run, store));
      done = run.tokens[run.tokens.length - 1][1];
    }
    run = null;
  };

  while (position < text.length) {
    tokenPattern.lastIndex = position;
    const found = tokenPattern.exec(text);
    const kind = found ? found.findIndex((g, i) => i > 0 && g !== undefined) : 0;
    if (found && kind === WS) {
      position += found[0].length;
    } else if (!found || endsRun(found, kind, text, depth)) {
      finish();
      depth = 0;
      position += found ? found[0].length : 1;
    } else {
      const [end, change, role] = read(text, found, kind, store);
      run ??= { tokens: [], hasCommand: false, poisoned: false };
      run.tokens.push([
        position,
        end,
        edgeOf(kind, found[0], role, SPACING.has(found[0].slice(1))),
      ]);
      run.hasCommand ||= role === "command";
      run.poisoned ||= role === "poison";
      depth = Math.max(0, depth + change);
      position = end;
    }
  }
  finish();
  pieces.push(text.slice(done));
  return pieces.join("");
}

function tagSegment(segment: string): string {
  if (!segment.includes("\\") || new RegExp(MARKS).test(segment)) return segment;
  const store: string[] = [];
  const protectedText = protectGroups(protectEnvironments(segment, store), store);
  return restored(tagRuns(protectedText, store), store);
}

/** Each formula written with no delimiters tagged. */
export function tagBareMaths(text: string): string {
  return mapUnprotected(text, tagSegment);
}
