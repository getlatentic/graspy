// Words written inside a maths font command, which KaTeX sets without spaces.
//
// `\mathrm{Akwa Ibom}` is valid LaTeX and shows "AkwaIbom": maths mode ignores
// spaces, and a font command only changes the letters. `\text{Akwa Ibom}` keeps
// them. A font command whose group holds words is written as its text command:
// `\mathrm` and `\operatorname` as `\text`; `\mathbf`, `\boldsymbol`, `\bm` and
// `\pmb` as `\textbf`; `\mathit` and `\mathnormal` as `\textit`; `\mathsf` as
// `\textsf`; `\mathtt` as `\texttt`.
//
// Words are a group of blank-separated tokens, one of them a word (two letters
// or more, with punctuation allowed between them: `re-do`), or a word with
// blanks before or after it (`\mathrm{ and }`, the way a model most often
// writes it). The characters are letters, marks, digits and `.,;:!?'’()-`. The
// group is left alone when it is a symbol or a name with no blank round it
// (`\mathrm{d}`, `\mathbf{v}`, `\mathrm{km}`), a single letter with blanks
// round it (`\mathrm{ d }`), single letters (`\mathrm{m s}`), or holds a
// command, brace, script, slash or any other character that is maths
// (`\mathrm{m s^{-1}}`, `\mathrm{km/h}`, `\mathrm{a + b}`). `\operatorname` is a
// name, so it needs two tokens, and is left alone when all are an operator's
// own words (`\operatorname{arg max}`, `\operatorname{ess sup}`). `\mathbb`,
// `\mathcal` and `\mathfrak` have no text command and `\operatorname*` is a
// limit operator: both are left alone.
//
// This is apps/server/src/app/domains/lesson/maths_fonts.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-fonts.ts is this file's twin.

const TEXT_COMMANDS: Record<string, string> = {
  mathrm: "text",
  mathbf: "textbf",
  boldsymbol: "textbf",
  bm: "textbf",
  pmb: "textbf",
  mathit: "textit",
  mathnormal: "textit",
  mathsf: "textsf",
  mathtt: "texttt",
  operatorname: "text",
};
// A group with no brace, backslash or script of its own.
const FONT = new RegExp(
  String.raw`\\(${Object.keys(TEXT_COMMANDS).join("|")})(?![A-Za-z*])[ \t\r\n]*\{([^{}\\]*)\}`,
  "g",
);
const BLANKS = /[ \t\r\n]+/;
const BLANK_CHARS = " \t\r\n";
const PROSE_CHARS = /^[\p{L}\p{M}0-9.,;:!?'’()-]+$/u;
const LETTER = /\p{L}/gu;
const OPERATOR_WORDS = new Set([
  "arg",
  "ess",
  "max",
  "min",
  "sup",
  "inf",
  "lim",
]);

const isWord = (token: string) => (token.match(LETTER)?.length ?? 0) >= 2;

function isPhrase(command: string, body: string): boolean {
  const tokens = body.split(BLANKS).filter((token) => token !== "");
  if (tokens.length === 0 || !PROSE_CHARS.test(tokens.join(""))) return false;
  if (!tokens.some(isWord)) return false;
  if (command === "operatorname") {
    return (
      tokens.length > 1 && !tokens.every((token) => OPERATOR_WORDS.has(token))
    );
  }
  const padded =
    BLANK_CHARS.includes(body[0]) ||
    BLANK_CHARS.includes(body[body.length - 1]);
  return tokens.length > 1 || padded;
}

/** Whether an odd number of backslashes come right before the position. */
function isEscaped(text: string, position: number): boolean {
  let start = position;
  while (start > 0 && text[start - 1] === "\\") start--;
  return (position - start) % 2 === 1;
}

/** The maths with each group of words in a font command written in a text command. */
export function wordsAsText(maths: string): string {
  return maths.replace(
    FONT,
    (whole: string, command: string, body: string, at: number) =>
      isEscaped(maths, at) || !isPhrase(command, body)
        ? whole
        : `\\${TEXT_COMMANDS[command]}{${body}}`,
  );
}
