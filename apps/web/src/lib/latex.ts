// The tutor's maths as remark-math reads it: every delimiter made a tag, and
// maths the model wrote with no delimiters tagged too, then the tags written as
// $ and $$. This is the rule of apps/server/src/app/domains/lesson/maths.py
// (repair_reply, reply_text), applied to text that never passed through it:
// lessons stored before it, replies still streaming. A pair of dollar signs is
// left alone: remark-math reads $...$ itself, and in a sentence about a shell
// or a URL it is not maths. tests/fixtures/math-repair.json holds the cases both
// must agree on. apps/server/ui/src/shared/latex.ts is this file's twin, and
// latex-scan.ts and latex-runs.ts are the twins of the server's maths_scan.py
// and maths_runs.py.
//
// Left to the server because they repair a lesson's JSON fields only: @@ for a
// backslash, control characters and doubled backslashes, $...$ made a tag, a
// list of letters kept as text, and the tikz fence. A chat answer is plain text.

import { tagBareMaths } from "./latex-runs";
import {
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

const DISPLAY_ONLY = /\\(begin|end)\{(align|gather)\*?\}/g;
// A worksheet blank typed as ___ is a double subscript to KaTeX, which shows
// the whole formula as source. \_ is the underscore itself.
const BLANK = /\\_|_{2,}/g;

function inlineMaths(maths: string): string {
  // align and gather are display-only, which KaTeX refuses inside a line.
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
  return tagsAsDollars(tagUndelimited(tagDelimiters(content, false)));
}
