// Reads the formulas in text the model wrote with no maths delimiters.
//
// The text is read token by token. A run is the tokens that can be part of a
// formula: commands KaTeX knows, single letters, numbers, names such as `df`,
// operators, brackets, and `\left` ... `\right` pairs, with the spaces between
// them. A word of prose, a newline, a sentence's closing punctuation (outside
// brackets) or any other character ends it, and so does what markdown uses:
// `|` (outside brackets and outside a table row), `*` and `_` that do not join
// two tokens, `.` and `:` that do not sit between digits. A run that holds a
// command or an environment is a formula, and is tagged less its edges: a
// dangling operator, an unmatched bracket, a trailing `\qquad`.
//
// A letter that follows a finished term with a space (`\frac12 s`, in Czech
// "with a number") is prose unless it touches an operator: `m v^2`, `x = 3`. A
// letter that begins a formula is a variable only when an operator follows it.
//
// A backslash word KaTeX does not know (a path, a regex, an escape, a command
// this does not list) poisons its run: the whole run is left as text, never
// half. So is a run over MAX_INLINE, one that follows a letter with no space
// (`Hello\alpha`), one beside a group over its cap, and one that ends in a
// command that needs an argument and is followed by a word of prose
// (`use \frac for fractions`).
//
// This is apps/server/src/app/domains/lesson/maths_reader.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases, and the
// vocabulary, both must agree on.
// Twin: apps/server/ui/src/shared/latex-reader.ts.

import { MAX_INLINE } from "./latex-scan";
import {
  BINDING,
  LETTERS,
  NUMBER,
  OPERATOR,
  PUNCT,
  WORD,
  WS,
  BINDS_TO,
  BLOCK_ONLY,
  COMES_AFTER,
  COMMAND_IN,
  INFIX_SET,
  NAME_SET,
  ONLY_ENVIRONMENT,
  PARTNER,
  PROSE_AFTER,
  RELATIONS,
  TOKEN_SOURCE,
  isDigit,
  read,
} from "./latex-tokens";

export { FUNCTIONS, INFIX, NAMES, RENAMED_ENVIRONMENTS, UNWRAPPED_ENVIRONMENTS, END, ENVIRONMENT, GROUP, MARKS, PLAIN, restore } from "./latex-tokens";

/** The tokens of a run, each as [start, end, edge]: its edge is "binary", "sign", "bind", "spacing", "infix", "func", "needs", "letter", a bracket, or "" for any other. */
type Edged = [start: number, end: number, edge: string];

interface Run {
  tokens: Edged[];
  hasCommand: boolean;
  poisoned: boolean;
}

const runStart = (run: Run) => run.tokens[0][0];
const runEnd = (run: Run) => run.tokens[run.tokens.length - 1][1];

/** Whether the line of a position is a row of a table. */
class Lines {
  private readonly text: string;
  private start = -1;
  private end = -1;
  private table = false;

  constructor(text: string) {
    this.text = text;
  }

  isTableRow(position: number): boolean {
    if (!(this.start <= position && position < this.end)) {
      this.start = this.text.lastIndexOf("\n", position - 1) + 1;
      const end = this.text.indexOf("\n", position);
      this.end = end < 0 ? this.text.length : end;
      const line = this.text.slice(this.start, this.end).replace(/^[ \t\r]+|[ \t\r]+$/g, "");
      this.table = line.startsWith("|") || line.endsWith("|");
    }
    return this.table;
  }
}

/** Whether ^, _, * or ' joins the token before it to the one after it. */
function binds(text: string, position: number, word: string, end: number, run: Run | null): boolean {
  if (run === null || runEnd(run) !== position) return false;
  BINDS_TO.lastIndex = end;
  return word === "'" || BINDS_TO.test(text);
}

function endsRun(
  text: string,
  token: RegExpExecArray,
  kind: number,
  depth: number,
  run: Run | null,
  lines: Lines,
): boolean {
  const word = token[0];
  const position = token.index;
  const end = position + word.length;
  if (kind === LETTERS) return word.length > 1 && !NAME_SET.has(word);
  if (kind === PUNCT && ".:".includes(word)) {
    return !(isDigit(text.charAt(position - 1)) && isDigit(text.charAt(end)));
  }
  if (kind === PUNCT) {
    // A sentence's punctuation, outside brackets, is followed by a space.
    return depth <= 0 && ["", " ", "\t", "\r", "\n"].includes(text.charAt(end));
  }
  if (kind === OPERATOR && word === "|") {
    return depth <= 0 || lines.isTableRow(position);
  }
  if (kind === OPERATOR && BINDING.includes(word)) {
    return !binds(text, position, word, end, run);
  }
  return false;
}

/** A list's label (`a) `, `1) `) at the start of a line. */
function isLabel(text: string, position: number, end: number): boolean {
  if (text.charAt(end) !== ")" || ![" ", "\t"].includes(text.charAt(end + 1))) {
    return false;
  }
  const window = text.slice(Math.max(0, position - 8), position);
  const newline = window.lastIndexOf("\n");
  const prefix = newline >= 0 ? window.slice(newline + 1) : position <= 8 ? window : "x";
  return !prefix.replace(/^[ \t]+|[ \t]+$/g, "");
}

/** Whether the letters from `position` belong to the run, and where they end. A letter after an operator belongs. After a finished term it belongs when it touches an operator, and a formula begins with a letter only when an operator follows it. */
function letterJoins(
  text: string,
  tokenPattern: RegExp,
  position: number,
  run: Run | null,
): [boolean, number] {
  const match = (at: number) => {
    tokenPattern.lastIndex = at;
    return tokenPattern.exec(text);
  };
  let lastEnd = position;
  let cursor = position;
  let count = 0;
  for (;;) {
    const token = match(cursor);
    if (!token || token.findIndex((g, i) => i > 0 && g !== undefined) !== LETTERS || token[0].length !== 1) break;
    count++;
    lastEnd = cursor = cursor + 1;
    while (text.charAt(cursor) === " " || text.charAt(cursor) === "\t") cursor++;
  }
  const follower = match(cursor);
  const kind = follower ? follower.findIndex((g, i) => i > 0 && g !== undefined) : 0;
  const adjacent = cursor === lastEnd;
  const word = follower ? follower[0] : "";
  const relation =
    follower !== null &&
    ((kind === OPERATOR && RELATIONS.includes(word)) ||
      (kind === WORD && INFIX_SET.has(word.slice(1))));
  const binding = adjacent && follower !== null && kind === OPERATOR && "^_*'([".includes(word);
  if (run === null) return [relation || binding, lastEnd];
  const exponent = run.tokens.length > 1 && run.tokens[run.tokens.length - 2][2] === "bind";
  return [(count === 1 && relation) || binding || exponent, lastEnd];
}

/** The tokens that are a bracket with no partner: a closing one with nothing open, an opening one nothing closes. */
function unmatchedBrackets(tokens: Edged[]): Set<number> {
  const opened: Record<string, number[]> = { "(": [], "[": [] };
  const unmatched = new Set<number>();
  tokens.forEach(([, , edge], index) => {
    if (edge in opened) {
      opened[edge].push(index);
    } else if (edge === ")" || edge === "]") {
      const waiting = opened[PARTNER[edge]];
      if (waiting.length) waiting.pop();
      else unmatched.add(index);
    }
  });
  for (const waiting of Object.values(opened)) {
    for (const index of waiting) unmatched.add(index);
  }
  return unmatched;
}

/** Which tokens of the run are the formula: those at the edges that are no part of it are cut, in one pass over the run. */
function trimmed(tokens: Edged[]): [number, number] | null {
  let low = 0;
  let high = tokens.length;
  const loose = unmatchedBrackets(tokens);
  while (low < high) {
    const first = tokens[low][2];
    const last = tokens[high - 1][2];
    const spaced = low + 1 < high && tokens[low + 1][0] > tokens[low][1];
    if (
      first === "binary" ||
      first === "spacing" ||
      (first === "sign" && spaced) ||
      loose.has(low)
    ) {
      low++;
    } else if (
      last === "binary" ||
      last === "sign" ||
      last === "spacing" ||
      last === "bind" ||
      loose.has(high - 1)
    ) {
      high--;
    } else {
      break;
    }
  }
  return low < high ? [low, high] : null;
}

/** The run inside the one pair of parentheses that holds all of it. */
function balancedUnwrapped(run: string): string | null {
  if (!(run.startsWith("(") && run.endsWith(")"))) return null;
  let depth = 0;
  for (let position = 0; position < run.length; position++) {
    depth += (run[position] === "(" ? 1 : 0) - (run[position] === ")" ? 1 : 0);
    if (depth === 0 && position < run.length - 1) return null;
  }
  return run.slice(1, -1);
}

/** A command written straight after a letter or digit is a path or an escape, not maths: `Hello\alpha`. */
function startsAttached(text: string, run: Run): boolean {
  const start = runStart(run);
  return text[start] === "\\" && start > 0 && /[A-Za-z0-9]/.test(text[start - 1]);
}

function tagged(text: string, run: Run, restoreGroup: (piece: string) => string): string {
  const first = runStart(run);
  const whole = text.slice(first, runEnd(run));
  const bounds = trimmed(run.tokens);
  if (bounds === null) return whole;
  const [low, high] = bounds;
  const start = run.tokens[low][0];
  const end = run.tokens[high - 1][1];
  const chunk = text.slice(start, end);
  const plain = restoreGroup(chunk);
  if (!COMMAND_IN.test(plain) || plain.length > MAX_INLINE) return whole;
  PROSE_AFTER.lastIndex = end;
  if (run.tokens[high - 1][2] === "needs" && PROSE_AFTER.test(text)) return whole;
  const before = text.slice(first, start);
  const after = text.slice(end, runEnd(run));
  if (BLOCK_ONLY.some((name) => plain.includes(`\\begin{${name}}`))) {
    if (!ONLY_ENVIRONMENT.test(chunk)) return whole;
    return `${before}<latex-block>${chunk}</latex-block>${after}`;
  }
  const inner = balancedUnwrapped(chunk);
  if (inner !== null && COMMAND_IN.test(restoreGroup(inner))) {
    const [, lead, maths, tail] = /^([ \t\r\n]*)([\s\S]*?)([ \t\r\n]*)$/.exec(inner)!;
    return `${before}(${lead}<latex-inline>${maths}</latex-inline>${tail})${after}`;
  }
  return `${before}<latex-inline>${chunk}</latex-inline>${after}`;
}

/** The text with each formula in it tagged. `restoreGroup` puts the groups and environments back into a piece of it. */
export function tagRuns(text: string, restoreGroup: (piece: string) => string): string {
  const pieces: string[] = [];
  const tokenPattern = new RegExp(TOKEN_SOURCE, "y");
  const lines = new Lines(text);
  let done = 0;
  let position = 0;
  let depth = 0;
  let clusterUntil = 0;
  let run: Run | null = null;

  const finish = () => {
    const formula = run !== null && run.hasCommand && !run.poisoned;
    if (
      run !== null &&
      formula &&
      !startsAttached(text, run) &&
      runEnd(run) - runStart(run) <= MAX_INLINE
    ) {
      pieces.push(text.slice(done, runStart(run)), tagged(text, run, restoreGroup));
      done = runEnd(run);
    }
    run = null;
  };

  while (position < text.length) {
    tokenPattern.lastIndex = position;
    const found = tokenPattern.exec(text);
    if (found === null) {
      finish();
      depth = 0;
      position++;
      continue;
    }
    const kind = found.findIndex((g, i) => i > 0 && g !== undefined);
    const word = found[0];
    if (kind === WS) {
      position += word.length;
      continue;
    }
    if (endsRun(text, found, kind, depth, run, lines)) {
      finish();
      depth = 0;
      position += word.length;
      continue;
    }
    if (run === null && (kind === LETTERS || kind === NUMBER) && isLabel(text, position, position + word.length)) {
      position += word.length + 1;
      continue;
    }
    const joined = run !== null && (runEnd(run) === position || COMES_AFTER.has(run.tokens[run.tokens.length - 1][2]));
    if (kind === LETTERS && word.length === 1 && position >= clusterUntil && !joined) {
      const [joins, clusterEnd] = letterJoins(text, tokenPattern, position, run);
      if (!joins) {
        finish();
        depth = 0;
        position = clusterEnd;
        continue;
      }
      clusterUntil = clusterEnd;
    }
    const [end, change, role, edge] = read(text, found, kind, restoreGroup);
    run ??= { tokens: [], hasCommand: false, poisoned: false };
    run.tokens.push([position, end, edge]);
    run.hasCommand ||= role === "command";
    run.poisoned ||= role === "poison";
    depth = Math.max(0, depth + change);
    position = end;
  }
  finish();
  pieces.push(text.slice(done));
  return pieces.join("");
}
