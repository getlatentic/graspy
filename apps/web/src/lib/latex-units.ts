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
const MOVED = /[·⋅×−]|[_^](?:\{[^{}]*\}|[0-9]+)/g;
const SIGNS: Record<string, string> = {
  "·": "\\cdot",
  "⋅": "\\cdot",
  "×": "\\times",
  "−": "-",
};
const DOTS = /[·⋅]/g;
const SCRIPTS = "_^";
// A text with one of these holds a dollar or maths of its own.
const OWN_MATHS = ["\\(", "$", '\\char"24'];
// How much of the maths before a text is looked at for a script it ends with.
const LOOKBACK = 40;
const ENDS_IN_SCRIPT = /([_^])(?:\{[^{}]{0,30}\}|[A-Za-z0-9])$/;

function script(moved: string): string {
  const inside = moved.slice(1);
  return inside.startsWith("{") || inside.length === 1 ? moved : `${moved[0]}{${inside}}`;
}

/** The script mark, _ or ^, that the maths ends in, or an empty string. */
const endsInScript = (written: string) => ENDS_IN_SCRIPT.exec(written.slice(-LOOKBACK))?.[1] ?? "";

function balanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    depth += Number(char === "{") - Number(char === "}");
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** What is to move out of the text: a script written after a backslash or another script mark is a different thing, and is left. */
function moves(body: string): RegExpExecArray[] {
  return [...body.matchAll(MOVED)].filter(
    (moved) =>
      moved[0] in SIGNS || moved.index === 0 || !`\\${SCRIPTS}`.includes(body[moved.index - 1]),
  ) as RegExpExecArray[];
}

type Pair = [text: string, moved: string];

/** The text as pairs of text and the character moved out after it, the last pair with an empty moved part; null when moving would leave a doubled script or unbalanced braces, or when the text holds maths of its own, which KaTeX reads in a text. The context is the end of the maths before. */
function parts(body: string, context: string): Pair[] | null {
  if (OWN_MATHS.some((mark) => body.includes(mark))) return null;
  const pairs: Pair[] = [];
  let done = 0;
  let previous = endsInScript(context);
  for (const moved of moves(body)) {
    const text = body.slice(done, moved.index);
    const sign = moved[0];
    const mark = SCRIPTS.includes(sign[0]) ? sign[0] : "";
    if (!balanced(text) || (mark && mark === (text ? "" : previous))) return null;
    pairs.push([text, SIGNS[sign] ?? script(sign)]);
    previous = mark;
    done = moved.index + sign.length;
  }
  const tail = body.slice(done);
  if (!pairs.length || !balanced(tail)) return null;
  pairs.push([tail, ""]);
  return pairs;
}

function written(pairs: Pair[]): string {
  const out: string[] = [];
  let afterScript = false;
  for (let [text, moved] of pairs) {
    if (afterScript && text.startsWith("/")) {
      out.push("/");
      text = text.slice(1);
    }
    if (text) out.push(`\\text{${text}}`);
    out.push(moved);
    afterScript = endsInScript(moved) !== "";
  }
  return out.join("");
}

function textGroup(whole: string, body: string, context: string, following: string): string {
  const pairs = parts(body, context);
  if (!pairs) return whole;
  const lastText = pairs[pairs.length - 1][0];
  const ended = pairs.length > 1 ? endsInScript(pairs[pairs.length - 2][1]) : "";
  if (!lastText && ended && following === ended) return whole;
  let result = written(pairs);
  // A command followed by a letter would run into it.
  if ((result.endsWith("\\cdot") || result.endsWith("\\times")) && /^[A-Za-z]$/.test(following)) {
    result += " ";
  }
  return result;
}

const dots = (maths: string) => maths.replace(DOTS, "\\cdot ");

/** The maths with what KaTeX cannot read in its text moved out of it. */
export function textInMaths(maths: string): string {
  const pieces: string[] = [];
  let done = 0;
  let context = "";
  for (const group of maths.matchAll(TEXT)) {
    const before = dots(maths.slice(done, group.index));
    const end = group.index + group[0].length;
    const written = textGroup(
      group[0],
      group[1],
      (context + before).slice(-LOOKBACK),
      maths.charAt(end),
    );
    pieces.push(before, written);
    context = (context + before + written).slice(-LOOKBACK);
    done = end;
  }
  pieces.push(dots(maths.slice(done)));
  return pieces.join("");
}
