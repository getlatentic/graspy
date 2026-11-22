// Maths the model wrote with no delimiters: \begin{pmatrix}...\end{pmatrix},
// \bar{x} = \underline{...} \qquad s = .... Each such run is tagged as one
// <latex-inline>.
//
// A run is items linked by an operator (`=`, `+`, `-`, `\qquad` ...): a command
// KaTeX knows with its arguments, a math environment, a braced or
// parenthesised group, a single letter, a number, or a name that a relation
// follows (`df =`). Words of prose join nothing, so "the sum - \sqrt{2}" keeps
// "the sum". A backslash word that is not in COMMANDS is a path, a regex or an
// escape, and with everything attached to it is text. A run with no command or
// environment in it is text too.
//
// Environments and braced groups are found first, by search, and stand in the
// text as one private-use character each, so a regex never counts their
// contents; one that is over its cap or crosses a blank line is a plain word,
// and a run beside it is left untagged, never split.
//
// This is apps/server/src/app/domains/lesson/maths_runs.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases, and the
// vocabulary, both must agree on. apps/web/src/lib/latex-runs.ts is
// this file's twin.

import {
  MAX_DISPLAY,
  MAX_INLINE,
  Searcher,
  mapUnprotected,
} from "./latex-scan";

const words = (list: string) => list.split(" ");

export const COMMANDS = words(
  // Greek
  "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa " +
    "lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi " +
    "psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega " +
    "eth hbar ell aleph Re Im wp " +
    // operators and functions
    "frac dfrac tfrac sqrt sum prod int iint oint lim limsup liminf sup inf max min " +
    "log ln lg exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth " +
    "det gcd lcm arg deg dim ker mod bmod pmod Pr binom choose over " +
    // symbols and relations
    "cdot cdots ldots dots vdots ddots times div pm mp ast star circ bullet oplus " +
    "otimes leq geq neq le ge ne ll gg approx equiv sim simeq cong propto infty " +
    "partial nabla forall exists nexists in notin ni subset subseteq supset supseteq " +
    "cup cap setminus emptyset varnothing to gets rightarrow leftarrow leftrightarrow " +
    "Rightarrow Leftarrow Leftrightarrow longrightarrow longleftarrow mapsto implies " +
    "impliedby iff therefore because angle perp parallel mid nmid triangle square " +
    "degree prime neg land lor wedge vee not colon " +
    // text, fonts, accents, spacing and sizing
    "text textbf textit textrm mathbf mathbb mathcal mathrm mathit mathsf mathtt " +
    "boldsymbol operatorname bar overline underline hat widehat tilde widetilde vec " +
    "dot ddot overrightarrow overbrace underbrace phantom hphantom vphantom cancel " +
    "boxed left right big Big bigg Bigg langle rangle lfloor rfloor lceil rceil vert " +
    "Vert lvert rvert lVert rVert displaystyle textstyle scriptstyle limits nolimits " +
    "stackrel overset underset xrightarrow xleftarrow substack",
);

// A function or operator name, or a capital Greek letter, takes the single
// letter or number after a space: `\sin x`, `\Delta E`.
export const FUNCTIONS = words(
  "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim " +
    "max min sup inf det arg Delta nabla partial Gamma Theta Lambda Xi Pi Sigma " +
    "Upsilon Phi Psi Omega",
);

// A name, not a word of prose, before a relation: `df = n - 1`.
export const NAMES = words(
  "p-value df dx dy dz dt ds SE SD CI Var Cov Corr Pr det rank dim gcd lcm erf sgn",
);

// align and gather are display-only, which KaTeX refuses inside a line of text.
export const ENVIRONMENTS = words(
  "matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix array aligned " +
    "alignedat gathered cases align align* gather gather*",
);

const GROUP = "";
const PLAIN = "";
const ENVIRONMENT = "";
const END = "";
const SENTINEL_MARKS = `[${GROUP}${PLAIN}${ENVIRONMENT}]`;
const SENTINEL = new RegExp(`${SENTINEL_MARKS}[0-9]+${END}`, "g");

const alternatives = (list: string[]) =>
  list.map((word) => word.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")).join("|");
const marked = (mark: string) => `${mark}[0-9]+${END}`;

const G = marked(GROUP);
const P = marked(PLAIN);
const E = marked(ENVIRONMENT);
const COMMAND = String.raw`\\(?:${alternatives(COMMANDS)})(?![A-Za-z])(?:${G}|[0-9]+)*`;
const FUNCTION =
  String.raw`\\(?:${alternatives(FUNCTIONS)})(?![A-Za-z])[ \t]+` +
  String.raw`(?:[A-Za-z](?![A-Za-z])|[0-9]+(?:\.[0-9]+)?)`;
const COMMAND_ATOM = `(?:${E}|${COMMAND})`;
const COMMAND_RUN = `${COMMAND_ATOM}(?:[ \\t]*${COMMAND_ATOM})*`;
const PAREN =
  String.raw`\((?:\\(?:${alternatives(COMMANDS)})(?![A-Za-z])` +
  String.raw`|[A-Za-z](?![A-Za-z])|[^A-Za-z()\n\\]){1,60}\)`;
const RELATION = "[=<>≤≥≠≈]";
const NAME = `(?:${alternatives(NAMES)})(?![A-Za-z0-9_-])(?=[ \\t]*${RELATION})`;
const SHORT = String.raw`(?:[A-Za-z](?![A-Za-z])|[0-9]+(?:\.[0-9]+)?)`;
const ITEM = `(?:${FUNCTION}|${COMMAND_RUN}|${G}|${PAREN}|${NAME}|${SHORT})+`;
const OPERATOR = String.raw`[ \t]*(?:[+\-/^_±×÷]|${RELATION}|\\q?quad(?![A-Za-z])|\\[,;])[ \t]*`;
const UNKNOWN = String.raw`\\[A-Za-z0-9_]*(?:\\[A-Za-z0-9_]*|[A-Za-z0-9_.:\-]+|${G}|${P}|${E})*`;
// A word with backslash words attached (`foo\frac12`) is text.
const WORD = String.raw`[A-Za-z]+(?:\\[A-Za-z0-9_]*)*`;
// What no run starts in the middle of is taken whole: a backslash word, a plain
// group, a word of prose.
const RUN_SOURCE = `(${ITEM}(?:${OPERATOR}${ITEM})*)|${UNKNOWN}|${P}|${WORD}`;

const HAS_COMMAND = new RegExp(
  String.raw`\\(?!q?quad(?![A-Za-z]))[A-Za-z]|${ENVIRONMENT}`,
);
const PLAIN_AFTER_SOURCE = `(?:${OPERATOR})?${P}`;
const PAREN_GROUP = new RegExp(`^${PAREN}$`);
const BEGIN_SOURCE = String.raw`\\begin\{(${alternatives(ENVIRONMENTS)})\}`;

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
    const mark = stop - opener.index <= MAX_DISPLAY ? ENVIRONMENT : PLAIN;
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
    const mark = end - start <= MAX_INLINE ? GROUP : PLAIN;
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

function taggedRun(
  run: string,
  chain: string | undefined,
  offset: number,
  whole: string,
): string {
  if (chain === undefined || !HAS_COMMAND.test(run)) return run;
  const plainAfter = new RegExp(PLAIN_AFTER_SOURCE, "y");
  plainAfter.lastIndex = offset + run.length;
  if (plainAfter.test(whole)) return run;
  if (PAREN_GROUP.test(run)) {
    // A group of parentheses alone is punctuation round the maths.
    const [, before, maths, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(
      run.slice(1, -1),
    )!;
    return `(${before}<latex-inline>${maths}</latex-inline>${after})`;
  }
  return `<latex-inline>${run}</latex-inline>`;
}

function tagSegment(segment: string): string {
  if (!segment.includes("\\") || new RegExp(SENTINEL_MARKS).test(segment)) {
    return segment;
  }
  const store: string[] = [];
  const protectedText = protectGroups(protectEnvironments(segment, store), store);
  return restored(protectedText.replace(new RegExp(RUN_SOURCE, "g"), taggedRun), store);
}

/** Each run of undelimited maths tagged. */
export function tagBareMaths(text: string): string {
  return mapUnprotected(text, tagSegment);
}
