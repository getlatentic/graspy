// The tutor's maths as remark-math reads it. Text that never passed through the
// server's repair (a lesson kept before it, a reply streaming in) is repaired
// here by the same rules: apps/server/src/app/domains/lesson/markdown.py and
// bare_math.py. tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/web/src/lib/latex.ts is this file's twin.

// \[ opens display maths unless it is the length of a line break, as in \\[4pt].
const LENGTH = String.raw`\s*-?[\d.]+\s*(?:pt|em|ex|mm|cm|in)\s*\]`;

// $$ and \[ \] are display maths, \( \) and $ $ inline. A pair of dollar signs
// is money, not maths, when it opens or closes on a space or a digit follows.
const DELIMITED = new RegExp(
  [
    String.raw`\\\$`,
    String.raw`\$\$([\s\S]*?)\$\$`,
    String.raw`\\\[(?!${LENGTH})([\s\S]*?)\\\]`,
    String.raw`\\\(([\s\S]*?)\\\)`,
    String.raw`\$((?:[^\s$]|[^\s$][^$]*?[^\s$]))\$(?!\d)`,
  ].join("|"),
  "g",
);

function tagDelimited(text: string): string {
  return text.replace(
    DELIMITED,
    (whole, display, bracketed, inline, dollars) => {
      if (display !== undefined || bracketed !== undefined) {
        return `<latex-block>${display ?? bracketed}</latex-block>`;
      }
      const maths = inline ?? dollars;
      return maths === undefined ? whole : `<latex-inline>${maths}</latex-inline>`;
    },
  );
}

const PROTECTED = new RegExp(
  [
    String.raw`<latex-(?:block|inline)>[\s\S]*?</latex-(?:block|inline)>`,
    String.raw`\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}`,
    "`[^`\\n]*`",
  ].join("|"),
  "g",
);

// Braced groups nested up to three deep.
const BRACED = String.raw`\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`;
// \qquad and \quad join the items either side of them, like an operator.
const COMMAND = String.raw`\\(?!begin\b|end\b|q?quad\b)[A-Za-z]+(?:${BRACED}|\d+)*`;

// align and gather are display-only, which KaTeX refuses inside a line of text,
// so they are written as their inline forms.
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
const DISPLAY_ONLY = /\\(begin|end)\{(align|gather)\*?\}/g;

const escaped = (name: string) => name.replace("*", String.raw`\*`);
const ENVIRONMENT = ENVIRONMENTS.map(
  (name) =>
    String.raw`\\begin\{${escaped(name)}\}[\s\S]*?\\end\{${escaped(name)}\}`,
).join("|");

// A run is joined items: commands and environments, a braced group, or a short
// word or number (`df`, `n`, `0.05`, `R(\theta)`), linked by an operator.
const COMMANDS = String.raw`(?:${ENVIRONMENT}|${COMMAND})(?:[ \t]*(?:${ENVIRONMENT}|${COMMAND}))*`;
const WORD = String.raw`(?:\d+(?:\.\d+)?|[A-Za-z]+)(?:\([^()\n]{0,30}\))?`;
const ITEM = `(?:${COMMANDS}|${BRACED}|${WORD})`;
const OPERATOR = String.raw`[ \t]*(?:[=<>+\-/^_≤≥≠≈±×÷]|\\q?quad(?![A-Za-z])|\\[,;])[ \t]*`;
const RUN = new RegExp(`${ITEM}(?:${OPERATOR}${ITEM})*`, "g");
const HAS_MATHS = /\\(?!q?quad\b)[A-Za-z]/;

function tagRun(run: string): string {
  if (!HAS_MATHS.test(run)) return run;
  const inline = run.replace(DISPLAY_ONLY, "\\$1{$2ed}");
  return `<latex-inline>${inline}</latex-inline>`;
}

// split() with a capture group puts the protected pieces at the odd indexes.
function tagBare(text: string): string {
  return text
    .split(new RegExp(`(${PROTECTED.source})`))
    .map((piece, index) => (index % 2 ? piece : piece.replace(RUN, tagRun)))
    .join("");
}

const MATHS_SPAN = /(<latex-(?:block|inline)>)([\s\S]*?)(<\/latex-(?:block|inline)>)/g;

// A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
// the whole formula as source. \_ is the underscore itself.
const BLANK = /\\_|_{2,}/g;

function blanksAsUnderscores(text: string): string {
  return text.replace(
    MATHS_SPAN,
    (_span, opening, maths, closing) =>
      opening +
      maths.replace(BLANK, (run: string) =>
        run === "\\_" ? run : "\\_".repeat(run.length),
      ) +
      closing,
  );
}

/** Rewrites the tutor's maths, however delimited or not, into the $$ and $ that remark-math reads. */
export function processLatex(content: string): string {
  return blanksAsUnderscores(tagBare(tagDelimited(content)))
    .replace(/<\/?latex-block>/g, "$$$$")
    .replace(/<\/?latex-inline>/g, "$");
}
