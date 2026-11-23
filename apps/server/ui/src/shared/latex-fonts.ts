// Words written inside a maths font command, which KaTeX sets without spaces.
//
// `\mathrm{Akwa Ibom}` is valid LaTeX and shows "AkwaIbom": maths mode ignores
// spaces, and a font command only changes the letters. `\text{Akwa Ibom}` keeps
// them. A font command whose group holds a phrase (two or more tokens, one of
// them a word of two letters or more) is written as its text command:
// `\mathrm` and `\operatorname` as `\text`, `\mathbf` as `\textbf`, `\mathit`
// as `\textit`, `\mathsf` as `\textsf`, `\mathtt` as `\texttt`.
//
// A group is left alone when it is a symbol or a name (`\mathrm{d}`,
// `\mathbf{v}`, `\mathrm{km}`), when it holds a command, brace, script, slash or
// any character that is maths (`\mathrm{m s^{-1}}`, `\mathrm{km/h}`), when it
// is single letters (`\mathrm{m s}`), and for `\operatorname` when every word
// is one of an operator's own (`\operatorname{arg max}`). So are `\mathbb`,
// `\mathcal` and `\mathfrak`, which have no text command, and `\operatorname*`.
//
// This is apps/server/src/app/domains/lesson/maths_fonts.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-fonts.ts is this file's twin.

const TEXT_COMMANDS: Record<string, string> = {
  mathrm: "text",
  mathbf: "textbf",
  mathit: "textit",
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
const PROSE_CHARS = /^[\p{L}\p{M}0-9.,;:!?'’()-]+$/u;
const LETTER = /\p{L}/gu;
const OPERATOR_WORDS = new Set(["arg", "max", "min", "sup", "inf", "lim"]);

const isWord = (token: string) => (token.match(LETTER)?.length ?? 0) >= 2;

function isPhrase(command: string, body: string): boolean {
  const tokens = body.split(BLANKS).filter((token) => token !== "");
  if (tokens.length < 2 || !PROSE_CHARS.test(tokens.join(""))) return false;
  if (!tokens.some(isWord)) return false;
  return (
    command !== "operatorname" ||
    !tokens.every((token) => OPERATOR_WORDS.has(token))
  );
}

/** Whether an odd number of backslashes come right before the position. */
function isEscaped(text: string, position: number): boolean {
  let start = position;
  while (start > 0 && text[start - 1] === "\\") start--;
  return (position - start) % 2 === 1;
}

/** The maths with each phrase in a font command written in a text command. */
export function wordsAsText(maths: string): string {
  return maths.replace(
    FONT,
    (whole: string, command: string, body: string, at: number) =>
      isEscaped(maths, at) || !isPhrase(command, body)
        ? whole
        : `\\${TEXT_COMMANDS[command]}{${body}}`,
  );
}
