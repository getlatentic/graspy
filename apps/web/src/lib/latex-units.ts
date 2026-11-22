// Units and formulas written as text inside maths, which KaTeX does not read.
//
// In `\text{...}` KaTeX prints `·` as the literal `\cdotp`, and refuses `_`, so
// the whole formula shows as source. The characters are moved out of the text:
// `\text{N·m}` is `\text{N}\cdot\text{m}`, `\text{OCH_2CH_3}` is
// `\text{OCH}_2\text{CH}_3`. A `_` is a subscript only before a digit or a
// braced group: `\text{___}` and `\text{foo_bar}` are left as they are. A `·` in
// maths outside a text is `\cdot`.
//
// This is apps/server/src/app/domains/lesson/maths_units.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-units.ts is this file's twin.

// One level of braces may sit inside the text: \text{NO_{3}}.
const TEXT = /\\text\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const MOVED = /[·⋅×−]|_(?:\{[^{}]*\}|[0-9]+)/g;
const SIGNS: Record<string, string> = {
  "·": "\\cdot",
  "⋅": "\\cdot",
  "×": "\\times",
  "−": "-",
};
const DOTS = /[·⋅]/g;

function subscript(moved: string): string {
  const inside = moved.slice(1);
  return inside.startsWith("{") || inside.length === 1 ? moved : `_{${inside}}`;
}

function textGroup(whole: string, body: string, following: string): string {
  const pieces: [string, boolean][] = [];
  let done = 0;
  for (const moved of body.matchAll(MOVED)) {
    pieces.push([body.slice(done, moved.index), false]);
    pieces.push([SIGNS[moved[0]] ?? subscript(moved[0]), true]);
    done = moved.index + moved[0].length;
  }
  if (!pieces.length) return whole;
  pieces.push([body.slice(done), false]);
  let written = pieces
    .map(([piece, isMoved]) => (isMoved ? piece : piece ? `\\text{${piece}}` : ""))
    .join("");
  // A command followed by a letter would run into it.
  if ((written.endsWith("\\cdot") || written.endsWith("\\times")) && /[A-Za-z]/.test(following)) {
    written += " ";
  }
  return written;
}

const dots = (maths: string) => maths.replace(DOTS, "\\cdot ");

/** The maths with what KaTeX cannot read in its text moved out of it. */
export function textInMaths(maths: string): string {
  const pieces: string[] = [];
  let done = 0;
  for (const group of maths.matchAll(TEXT)) {
    const end = group.index + group[0].length;
    pieces.push(
      dots(maths.slice(done, group.index)),
      textGroup(group[0], group[1], maths.charAt(end)),
    );
    done = end;
  }
  pieces.push(dots(maths.slice(done)));
  return pieces.join("");
}
