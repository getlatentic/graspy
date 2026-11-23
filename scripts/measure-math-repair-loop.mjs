// The generic repair the measurement tries in place of hand-written rules: parse
// the formula with KaTeX, read the class of the error and its position, apply
// the one fix for that class, and parse again, until the formula parses or no
// fix is left. Nothing here knows a failure's shape beforehand: a fix is keyed
// on KaTeX's own message. scripts/measure-math-repair.mjs gives it the KaTeX calls and says how it is judged.

const MAX_STEPS = 8;

const insertAt = (tex, at, mark) => tex.slice(0, at) + mark + tex.slice(at);
const replaceAt = (tex, at, length, mark) =>
  tex.slice(0, at) + mark + tex.slice(at + length);

const FIXES = [
  {
    name: "double script: group the first with {}",
    match: /^Double (?:sub|super)script/,
    fix: (span, error) => ({
      ...span,
      tex: insertAt(span.tex, error.position, "{}"),
    }),
  },
  {
    name: "unclosed group: append }",
    match:
      /^Unexpected end of input in a macro argument, expected '}'|^Expected '}', got 'EOF'/,
    fix: (span) => ({ ...span, tex: `${span.tex}}` }),
  },
  {
    name: "unclosed \\left: append \\right.",
    match: /^Expected '\\right', got 'EOF'/,
    fix: (span) => ({ ...span, tex: `${span.tex}\\right.` }),
  },
  {
    name: "extra }: drop it",
    match: /^Expected 'EOF', got '}'/,
    fix: (span, error) => ({
      ...span,
      tex: replaceAt(span.tex, error.position, 1, ""),
    }),
  },
  {
    name: "stray & _ #: escape it",
    match: /^Expected 'EOF', got '[&_#]'/,
    fix: (span, error) => ({
      ...span,
      tex: insertAt(span.tex, error.position, "\\"),
    }),
  },
  {
    name: "unknown column alignment @: drop its {…} argument",
    match: /^Unknown column alignment: @/,
    fix: (span, error) => ({
      ...span,
      tex:
        span.tex.slice(0, error.position) +
        span.tex.slice(error.position).replace(/^@\{[^{}]*\}/, ""),
    }),
  },
  {
    name: "$ in maths: escape it",
    match: /^Can't use function '\$' in math mode/,
    fix: (span, error) => ({
      ...span,
      tex: insertAt(span.tex, error.position, "\\"),
    }),
  },
  {
    name: "display-only environment: set the formula as a display",
    match: /can be used only in display mode/,
    fix: (span) => ({ ...span, display: true }),
  },
  {
    name: "unknown command: set its name as an operator",
    match: /^Undefined control sequence: (\\[A-Za-z]+)/,
    fix: (span, error, found) =>
      span.tex.includes(found[1])
        ? {
            ...span,
            tex: span.tex.replace(
              found[1],
              `\\operatorname{${found[1].slice(1)}}`,
            ),
          }
        : span,
  },
];

function repairSpan(span, { parseError, errorClass }) {
  let current = { tex: span.tex, display: span.display };
  const steps = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const error = parseError(current.tex, current.display);
    if (!error) return { span: current, steps, unfixed: null };
    const message = String(error.rawMessage ?? error.message);
    const known = FIXES.map((fix) => [fix, fix.match.exec(message)]).find(
      ([, found]) => found,
    );
    if (!known) return { span: current, steps, unfixed: errorClass(error) };
    const next = known[0].fix(current, error, known[1]);
    if (next.tex === current.tex && next.display === current.display) {
      return { span: current, steps, unfixed: errorClass(error) };
    }
    steps.push(known[0].name);
    current = next;
  }
  return {
    span: current,
    steps,
    unfixed: "no clean parse in " + MAX_STEPS + " steps",
  };
}

/** A view's formulas repaired by the loop: whether all parse, what the text
 * then shows, the fixes applied and the error classes the loop could not fix. */
export function repairLoop(view, tools) {
  const steps = [];
  const unfixed = [];
  const shown = view.parts.map((part) => {
    if (!part.span) return part.text;
    const done = repairSpan(part.span, tools);
    steps.push(...done.steps);
    if (done.unfixed) unfixed.push(done.unfixed);
    return `[${tools.typeset(done.span.tex, done.span.display)}]`;
  });
  return {
    parsed: unfixed.length === 0,
    clean: unfixed.length === 0 && view.leaks === 0,
    shown: shown.join(""),
    steps,
    unfixed,
  };
}
