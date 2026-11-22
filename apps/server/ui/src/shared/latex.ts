// The tutor's maths as remark-math reads it: every delimiter made a tag, and
// maths the model wrote with no delimiters tagged too, then the tags written as
// $ and $$. This is the rule of apps/server/src/app/domains/lesson/maths.py
// (repair_reply, reply_text), applied to text that never passed through it:
// lessons stored before it, replies still streaming. A pair of dollar signs is
// left to remark-math, which reads $...$ itself, and every other dollar sign is
// written \$, so that none pairs with another in a sentence about a shell, a URL
// or a price. tests/fixtures/math-repair.json holds the cases both must agree
// on. apps/web/src/lib/latex.ts is this file's twin, and latex-scan.ts,
// latex-runs.ts and latex-vocabulary.ts are the twins of the server's
// maths_scan.py, maths_runs.py and maths_vocabulary.py.
//
// Left to the server because they repair a lesson's JSON fields only: @@ for a
// backslash, control characters and doubled backslashes, $...$ made a tag, a
// list of letters kept as text, and the tikz fence. A chat answer is plain text.

import {
  RENAMED_ENVIRONMENTS,
  UNWRAPPED_ENVIRONMENTS,
  tagBareMaths,
} from "./latex-runs";
import {
  LENGTH,
  mapMaths,
  mapUnprotected,
  tagDelimiters,
  tagsAsDollars,
} from "./latex-scan";

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

// A line break with a length, \\[4pt], that an earlier version of the web read
// as a display delimiter and wrote as \$$4pt].
const MANGLED_LINE_BREAK = new RegExp(String.raw`\\\$\$(?=${LENGTH})`, "g");

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const DISPLAY_ONLY = new RegExp(
  String.raw`\\(begin|end)\{(${[
    ...Object.keys(RENAMED_ENVIRONMENTS),
    ...UNWRAPPED_ENVIRONMENTS,
  ]
    .map(escapeRegExp)
    .join("|")})\}`,
  "g",
);
// A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
// the whole formula as source. \_ is the underscore itself.
const BLANK = /\\_|_{2,}/g;

function inlineMaths(maths: string): string {
  // Environments KaTeX refuses within a line of text are written as the ones
  // it accepts.
  return maths
    .replace(DISPLAY_ONLY, (_whole, edge: string, name: string) =>
      UNWRAPPED_ENVIRONMENTS.includes(name)
        ? ""
        : `\\${edge}{${RENAMED_ENVIRONMENTS[name]}}`,
    )
    .replace(BLANK, (run) => (run === "\\_" ? run : "\\_".repeat(run.length)));
}

function tagUndelimited(text: string): string {
  return mapMaths(
    tagBareMaths(mapUnprotected(text, phoneticLetters)),
    inlineMaths,
  );
}

const DOLLAR = /\\\\|\\\$|\$/g;

/** A dollar sign outside every span is a dollar sign, not an opener. */
function escapeStrayDollars(text: string): string {
  return mapUnprotected(text, (part) =>
    part.replace(DOLLAR, (mark) => (mark === "$" ? "\\$" : mark)),
  );
}

/** Rewrites the tutor's maths, however delimited or not, into the $$ and $ that remark-math reads. */
export function processLatex(content: string): string {
  if (!content) return content;
  const text = content.replace(MANGLED_LINE_BREAK, "\\\\[");
  return tagsAsDollars(
    escapeStrayDollars(tagUndelimited(tagDelimiters(text, false))),
  );
}
