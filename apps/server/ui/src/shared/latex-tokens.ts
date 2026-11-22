// The tokens a formula is read from: the words KaTeX's commands and the model's
// names make, the pieces a regex finds, and the edge each piece has in a run.
//
// This is apps/server/src/app/domains/lesson/maths_tokens.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases, and the
// vocabulary, both must agree on.
// Twin: apps/web/src/lib/latex-tokens.ts.

import {
  COMMANDS,
  DISPLAY_ONLY_ENVIRONMENTS,
  INFIX,
  NEEDS_ARGUMENT,
} from "./latex-vocabulary";

export { INFIX };

// A name, not a word of prose, that may stand in a formula: `df = n - 1`.
export const NAMES =
  "p-value df dx dy dz dt ds dr du dv dw SE SD CI Var Cov Corr Pr det rank dim gcd lcm erf sgn".split(
    " ",
  );

// Commands whose argument, or whose variable, is the letter after a space.
export const FUNCTIONS = (
  "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa " +
  "lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi " +
  "psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega ell hbar " +
  "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp " +
  "lim limsup liminf max min sup inf det arg dim ker gcd lcm sum prod int iint iiint " +
  "oint partial nabla"
).split(" ");

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
// What is left is display maths and nothing else.
export const BLOCK_ONLY = DISPLAY_ONLY_ENVIRONMENTS.filter(
  (name) =>
    !(name in RENAMED_ENVIRONMENTS) && !UNWRAPPED_ENVIRONMENTS.includes(name),
);

export const GROUP = "";
export const PLAIN = "";
export const ENVIRONMENT = "";
export const END = "";
export const MARKS = `[${GROUP}${PLAIN}${ENVIRONMENT}]`;
export const SENTINEL = new RegExp(`${MARKS}[0-9]+${END}`, "g");
export const ONLY_ENVIRONMENT = new RegExp(`^${ENVIRONMENT}[0-9]+${END}$`);

export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
export const COMMAND_SET = new Set(COMMANDS);
export const NAME_SET = new Set(NAMES);
export const INFIX_SET = new Set(INFIX);
export const FUNCTION_SET = new Set(FUNCTIONS);
export const NEEDS_SET = new Set(NEEDS_ARGUMENT);
export const SPACING = new Set(["quad", "qquad"]);
export const OPENING = new Set(["left", "bigl", "Bigl", "biggl", "Biggl"]);
export const CLOSING = new Set(["right", "bigr", "Bigr", "biggr", "Biggr"]);
export const SIZED = new Set(["middle", "big", "Big", "bigg", "Bigg"]);
// Delimiters that open and close a group of their own accord.
export const OPENS = new Set([
  "lvert",
  "lVert",
  "langle",
  "lfloor",
  "lceil",
  "lbrace",
  "lbrack",
  "lgroup",
  "lmoustache",
]);
export const CLOSES = new Set([
  "rvert",
  "rVert",
  "rangle",
  "rfloor",
  "rceil",
  "rbrace",
  "rbrack",
  "rgroup",
  "rmoustache",
]);
export const DELIMITER_WORDS =
  "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil vert Vert " +
  "backslash uparrow downarrow Uparrow Downarrow updownarrow lbrace rbrace " +
  "lbrack rbrack lgroup rgroup lmoustache rmoustache";
export const DELIMITER = new RegExp(
  String.raw`[ \t]*(?:\\[{}|]|\\(?:${DELIMITER_WORDS.split(" ").join("|")})(?![A-Za-z])|[()\[\]|./<>])`,
  "y",
);
export const HYPHENATED = NAMES.filter((name) => name.includes("-"))
  .map(escapeRegExp)
  .join("|");

export const TOKEN_SOURCE = [
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
export const [WS, WORD, MARK, , , LETTERS, NUMBER, PUNCT, OPERATOR] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

export const BINARY = "=<>/≤≥≠≈×÷,;:";
export const SIGNS = "+-±";
export const BINDING = "^_*'";
export const DANGLING = "^_*";
export const BRACKETS = "()[]";
export const RELATIONS = "=<>+-±/≤≥≠≈×÷";
export const PARTNER: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[" };
export const COMES_AFTER = new Set(["binary", "sign", "bind", "infix", "func", "(", "["]);
export const BINDS_TO = new RegExp(`[A-Za-z0-9(\\[${GROUP}${PLAIN}${ENVIRONMENT}]|\\\\[A-Za-z]`, "y");
export const COMMAND_IN = new RegExp(
  String.raw`\\(?!q?quad(?![A-Za-z]))[A-Za-z]|${ENVIRONMENT}`,
);
export const BACKSLASH_WORD = /\\([A-Za-z]+)/g;
export const PROSE_AFTER = /[ \t]+[A-Za-z]{2,}/y;

/** The text with each group and environment put back; a group may hold an environment, which holds neither. */
export function restore(text: string, store: string[]): string {
  for (;;) {
    const next = text.replace(SENTINEL, (mark) => store[Number(mark.slice(1, -1))]);
    if (next === text) return text;
    text = next;
  }
}

export const isDigit = (char: string) => char.length === 1 && char >= "0" && char <= "9";


export type Role = "command" | "poison" | "math";
export type Read = [end: number, change: number, role: Role, edge: string];

export function plainEdge(kind: number, word: string): string {
  if (kind === LETTERS) return word.length === 1 ? "letter" : "";
  if (kind === OPERATOR || kind === PUNCT) {
    if (BINARY.includes(word)) return "binary";
    if (SIGNS.includes(word)) return "sign";
    if (DANGLING.includes(word)) return "bind";
    return BRACKETS.includes(word) ? word : "";
  }
  return "";
}

export function wordEdge(name: string): string {
  if (NEEDS_SET.has(name)) return "needs";
  if (FUNCTION_SET.has(name)) return "func";
  return INFIX_SET.has(name) ? "infix" : "";
}

/** A braced group has the role of the backslash words in it: a command it does not know poisons it, one it knows makes it a formula. */
export function groupRole(inside: string): Role {
  const names = [...inside.matchAll(BACKSLASH_WORD)].map((m) => m[1]);
  if (names.some((name) => !COMMAND_SET.has(name))) return "poison";
  return names.some((name) => !SPACING.has(name)) ? "command" : "math";
}

/** The end of the token with what belongs to it, the change in bracket depth, its role and its edge. */
export function read(
  text: string,
  token: RegExpExecArray,
  kind: number,
  restoreGroup: (piece: string) => string,
): Read {
  const word = token[0];
  const end = token.index + word.length;
  if (kind === WORD) {
    const name = word.slice(1);
    if (OPENING.has(name) || CLOSING.has(name) || SIZED.has(name)) {
      DELIMITER.lastIndex = end;
      const delimiter = DELIMITER.exec(text);
      if (delimiter) {
        const stop = end + delimiter[0].length;
        if (OPENING.has(name)) return [stop, 1, "command", "("];
        if (CLOSING.has(name)) return [stop, -1, "command", ")"];
        return [stop, 0, "command", "infix"];
      }
    }
    if (OPENS.has(name)) return [end, 1, "command", "("];
    if (CLOSES.has(name)) return [end, -1, "command", ")"];
    if (SPACING.has(name)) return [end, 0, "math", "spacing"];
    const role: Role = COMMAND_SET.has(name) ? "command" : "poison";
    return [end, 0, role, wordEdge(name)];
  }
  if (kind === MARK) {
    if (word[0] === GROUP) return [end, 0, groupRole(restoreGroup(word)), ""];
    return [end, 0, word[0] === PLAIN ? "poison" : "command", ""];
  }
  if (kind === OPERATOR) {
    const change = "([".includes(word) ? 1 : ")]".includes(word) ? -1 : 0;
    return [end, change, "math", plainEdge(kind, word)];
  }
  return [end, 0, "math", plainEdge(kind, word)];
}

