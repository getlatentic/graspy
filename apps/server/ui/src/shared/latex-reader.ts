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
// Twin: apps/web/src/lib/latex-reader.ts.

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
  CLOSING,
  MARK,
  MARK_CHARS,
  OPENING,
  insideWord,
  skipSpaces,
  BLOCK_ONLY,
  COMES_AFTER,
  COMMAND_IN,
  INFIX_SET,
  NAME_SET,
  ONLY_ENVIRONMENT,
  PARTNER,
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
  // Begun right after an opener nothing closed: the maths is still being written.
  suppressed: boolean;
  // \left and \right opened and not closed, or the other way about.
  sized: number;
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

const ATTACHES = "^()[]\\";
// What a term, as opposed to an operator, ends in.
const TERMS = new Set(["letter", "number", "group", ")", "]", "func"]);

/** Whether a word of two to four letters is a product of variables (`mv`, `4ac`, `\\pi r`): only one that touches a digit, bracket, ^ or command with no space does. Every other word is prose, whatever stands beside it. A formula begins with one only before `^` or a digit, or when it is two or three capitals before a relation (`KE = ...`). */
function shortWordJoins(
  text: string,
  tokenPattern: RegExp,
  word: string,
  position: number,
  run: Run | null,
): boolean {
  if (word.length > 4) return false;
  const end = position + word.length;
  const after = text.charAt(end);
  if (run === null) {
    tokenPattern.lastIndex = skipSpaces(text, end);
    const follower = tokenPattern.exec(text);
    const relation =
      follower !== null &&
      follower.findIndex((g, i) => i > 0 && g !== undefined) === OPERATOR &&
      "=<>≤≥≠≈".includes(follower[0]);
    const capitals = word === word.toUpperCase() && word.length <= 3;
    return (capitals && relation) || after === "^" || isDigit(after);
  }
  const touches = after !== "" && (ATTACHES.includes(after) || isDigit(after) || MARK_CHARS.includes(after));
  const previous = run.tokens[run.tokens.length - 1];
  const attached = runEnd(run) === position && previous[2] !== "(" && previous[2] !== "[";
  return attached || touches;
}

function endsRun(
  text: string,
  tokenPattern: RegExp,
  token: RegExpExecArray,
  kind: number,
  depth: number,
  run: Run | null,
  lines: Lines,
): boolean {
  const word = token[0];
  const position = token.index;
  const end = position + word.length;
  if (kind === LETTERS) {
    return word.length > 1 && !NAME_SET.has(word) && !shortWordJoins(text, tokenPattern, word, position, run);
  }
  if (kind === PUNCT && ".:".includes(word)) {
    const after = text.charAt(end);
    return !(isDigit(text.charAt(position - 1)) && (isDigit(after) || after === "\\"));
  }
  if (kind === OPERATOR && "()[]".includes(word) && text.charAt(position - 1) === "\\") {
    // \( \) \[ \] are delimiters of maths, not brackets of a formula.
    return true;
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
/** Whether a variable, a number, a group or a command comes next: what an operator command stands before in a formula, and a word does not. */
function mathAfter(text: string, tokenPattern: RegExp, position: number): boolean {
  tokenPattern.lastIndex = skipSpaces(text, position);
  const follower = tokenPattern.exec(text);
  if (follower === null) return false;
  const kind = follower.findIndex((g, i) => i > 0 && g !== undefined);
  if (kind === LETTERS) return follower[0].length === 1;
  return kind === NUMBER || kind === MARK || kind === WORD;
}

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
      (kind === WORD && INFIX_SET.has(word.slice(1)) && mathAfter(text, tokenPattern, follower.index + word.length)));
  const binding = adjacent && follower !== null && kind === OPERATOR && "^_*'([".includes(word);
  if (run === null) return [relation || binding, lastEnd];
  const previousEdge = run.tokens[run.tokens.length - 1][2];
  if (previousEdge === "infix" && runEnd(run) !== position) {
    // A letter a space after an operator command is a variable only if what
    // follows is no word of prose.
    const prose = follower !== null && kind === LETTERS;
    const term = run.tokens.length > 1 && TERMS.has(run.tokens[run.tokens.length - 2][2]);
    return [count === 1 && (term || cursor >= text.length || !prose), lastEnd];
  }
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


/** Whether a command that takes an argument has `[` after it that nothing closes, or `]` closing it as the last token: `\\sqrt[3` and `\\sqrt[3]`. */
function optionalArgumentWaits(tokens: Edged[], low: number, high: number): boolean {
  const loose = unmatchedBrackets(tokens);
  const takes = (index: number) => ["needs", "needs2"].includes(tokens[index][2]);
  for (let index = Math.max(low, 1); index < high; index++) {
    if (loose.has(index) && tokens[index][2] === "[" && takes(index - 1)) return true;
  }
  if (tokens[high - 1][2] !== "]") return false;
  let depth = 0;
  for (let index = high - 1; index >= low; index--) {
    depth += (tokens[index][2] === "]" ? 1 : 0) - (tokens[index][2] === "[" ? 1 : 0);
    if (depth === 0) return index > low && takes(index - 1);
  }
  return false;
}

/** Whether the formula stops where an argument is still to come: it ends in a command that takes one, or in a command that takes two and has one, or an unclosed group follows. This is a formula still being written, or prose. */
function unfinished(text: string, run: Run, low: number, high: number, end: number): boolean {
  const last = run.tokens[high - 1][2];
  if (last === "needs" || last === "needs2") return true;
  if (last === "group" && high > 1 && run.tokens[high - 2][2] === "needs2") return true;
  if (optionalArgumentWaits(run.tokens, low, high)) return true;
  return text.charAt(skipSpaces(text, end)) === "{";
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
  if (unfinished(text, run, low, high, end)) return whole;
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

const LABEL = /\([A-Za-z0-9]{1,4}\)[ \t]+/y;

/** Where a list's label, `(i) ` or `(2) `, ends if one is here: it sits between two terms with no operator, and a command or a number follows. */
function labelAhead(text: string, tokenPattern: RegExp, position: number, run: Run | null): number {
  LABEL.lastIndex = position;
  const label = LABEL.exec(text);
  if (!label || (run && COMES_AFTER.has(run.tokens[run.tokens.length - 1][2]))) return -1;
  const stop = position + label[0].length;
  tokenPattern.lastIndex = stop;
  const follower = tokenPattern.exec(text);
  if (!follower) return -1;
  const kind = follower.findIndex((g, i) => i > 0 && g !== undefined);
  if (kind !== WORD && kind !== NUMBER && kind !== MARK) return -1;
  return kind === WORD && INFIX_SET.has(follower[0].slice(1)) ? -1 : stop;
}

/** Whether a formula begins right after `$`, `$$`, `\\(` or `\\[` that nothing closed (a closed pair is a span, and never in this text): the maths is still being written. An amount, `$5`, is the one `$` that is not an opener. */
function afterOpener(text: string, position: number): boolean {
  const before = text.charAt(position - 1);
  if (before === "$") return !isDigit(text.charAt(position));
  const pair = text.slice(Math.max(0, position - 2), position);
  // \\[ is a line break, whose second backslash opens nothing.
  return (pair === "\\(" || pair === "\\[") && text.charAt(position - 3) !== "\\";
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
      !run.suppressed &&
      run.sized === 0 &&
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
    if (endsRun(text, tokenPattern, found, kind, depth, run, lines)) {
      finish();
      depth = 0;
      position += word.length;
      continue;
    }
    if (run === null && insideWord(text, position)) {
      position += word.length;
      continue;
    }
    if (word === "(") {
      const label = labelAhead(text, tokenPattern, position, run);
      if (label > 0) {
        finish();
        depth = 0;
        position = label;
        continue;
      }
    }
    if (run === null && (kind === LETTERS || kind === NUMBER) && isLabel(text, position, position + word.length)) {
      position += word.length + 1;
      continue;
    }
    const lastEdge = run === null ? "" : run.tokens[run.tokens.length - 1][2];
    const spacedCommand = run !== null && lastEdge === "infix" && runEnd(run) !== position;
    const joined = run !== null && (runEnd(run) === position || (COMES_AFTER.has(lastEdge) && !spacedCommand));
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
    if (run === null) {
      run = { tokens: [], hasCommand: false, poisoned: false, suppressed: afterOpener(text, position), sized: 0 };
    }
    if (kind === WORD) {
      const name = word.slice(1);
      run.sized += (OPENING.has(name) && edge === "(" ? 1 : 0) - (CLOSING.has(name) && edge === ")" ? 1 : 0);
    }
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
