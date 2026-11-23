// Measures how far KaTeX's own parser could drive the LaTeX repair instead of
// the hand-written rules (docs/MATHS_REPAIR.md has the question and the
// numbers). Run from the repository root after `npm install`:
//
//   node scripts/measure-math-repair.mjs [--list] [--json]
//
// Each text is looked at three ways, as the chat's markdown pipeline (remark
// with remark-math, then KaTeX) would show it:
//   raw         the text as the model wrote it
//   delimiters  its delimiters made $ and $$, nothing inside a formula touched
//               (what KaTeX alone is given when only the delimiters are found)
//   repaired    processLatex, every rule
// A view is clean when every formula parses (`throwOnError: true`, with the
// app's `strict: false`) and no LaTeX command is left in the prose. KaTeX's
// strict mode is counted apart: it flags LaTeX a TeX engine would refuse that
// KaTeX still sets. The texts are the repair corpus and the 96 lessons of the
// grounding study, which are a model's own output where the corpus is not.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { repairLoop } from "./measure-math-repair-loop.mjs";

// KaTeX warns on a character it has no metrics for (an emoji) in every formula.
console.warn = () => {};

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const argument = (name) => process.argv.includes(name);

async function bundle(path) {
  const out = await build({
    entryPoints: [fileURLToPath(new URL(path, root))],
    bundle: true,
    format: "esm",
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`
  );
}

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** The error KaTeX throws for a formula, or null: what the chat shows as source. */
function parseError(tex, display) {
  try {
    katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      strict: false,
      output: "html",
    });
    return null;
  } catch (error) {
    return error;
  }
}

/** The distinct codes of what strict mode would refuse in a formula that
 * parses: LaTeX that KaTeX accepts and a TeX engine would not, such as a
 * Unicode letter in maths. */
function strictCodes(tex, display) {
  const codes = [];
  const strict = (code) => (codes.push(code), "ignore");
  try {
    katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      strict,
      output: "html",
    });
  } catch {
    // A formula that does not parse has no codes to count.
  }
  return [...new Set(codes)];
}

function typeset(tex, display) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: false,
    errorColor: "inherit",
    output: "html",
  });
  return html.replace(/<[^>]*>/g, "").replace(/​/g, "");
}

/** The error's class: its message without the tokens that make it particular. */
function errorClass(error) {
  return String(error.rawMessage ?? error.message)
    .replace(/(Undefined control sequence: )\\[A-Za-z]+/, "$1\\name")
    .replace(/^\{[^}]*\}/, "{environment}")
    .replace(/(Expected group (?:after|as argument to) )'[^']*'/, "$1'command'")
    .replace(/Unexpected character: '[^']*'/, "Unexpected character")
    .trim();
}

const LEAK = /\\[A-Za-z]{2,}|\$\$/;
const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
const table = (map) => [...map].sort((a, b) => b[1] - a[1]);
const tools = { parseError, errorClass, typeset };

/** What a text shows as the chat's markdown pipeline reads it. */
function view(text) {
  const parts = [];
  const errors = [];
  const strict = new Map();
  let leaks = 0;
  visit(markdown.parse(text), (node) => {
    if (node.type === "math" || node.type === "inlineMath") {
      const span = { tex: node.value, display: node.type === "math" };
      span.error = parseError(span.tex, span.display);
      if (span.error) errors.push(span);
      else {
        const codes = strictCodes(span.tex, span.display);
        for (const code of codes) bump(strict, code);
        if (codes.length)
          strict.set(
            "(formulas with any code)",
            (strict.get("(formulas with any code)") ?? 0) + 1,
          );
      }
      parts.push({ span });
      return "skip";
    }
    if (node.type === "code" || node.type === "inlineCode") return "skip";
    if (node.type === "text") {
      if (LEAK.test(node.value)) leaks++;
      parts.push({ text: node.value });
    }
    return undefined;
  });
  const shown = parts
    .map((p) => (p.span ? `[${typeset(p.span.tex, p.span.display)}]` : p.text))
    .join("");
  return {
    parts,
    errors,
    strict,
    leaks,
    shown,
    formulas: parts.filter((p) => p.span).length,
    clean: !errors.length && !leaks,
  };
}

function views(text, repair) {
  const delimited = repair.tagsAsDollars(repair.tagDelimiters(text, false));
  return {
    raw: view(text),
    delimiters: view(delimited),
    repaired: view(repair.processLatex(text)),
  };
}

const DONE = {
  prose: "no maths, and none made",
  right: "right as written",
  delimiters: "right once the delimiters are found",
  semantic: "parses clean but shows wrong: a rule changed what it shows",
  internal: "a formula fails to parse: a rule fixed it",
  found: "no formula for KaTeX to read: a rule found the maths",
  open: "still wrong after the repair",
};

function classify({ raw, delimiters, repaired }) {
  if (!repaired.clean) return DONE.open;
  if (
    !repaired.formulas &&
    !delimiters.formulas &&
    raw.shown === repaired.shown
  )
    return DONE.prose;
  if (raw.clean && raw.formulas && raw.shown === repaired.shown)
    return DONE.right;
  if (delimiters.clean && delimiters.shown === repaired.shown)
    return DONE.delimiters;
  if (delimiters.clean && delimiters.formulas) return DONE.semantic;
  if (delimiters.errors.length) return DONE.internal;
  return DONE.found;
}

function measure(name, texts, repair, fonts) {
  const buckets = new Map();
  const before = new Map();
  const after = new Map();
  const strictBefore = new Map();
  const strictAfter = new Map();
  const loop = {
    tried: 0,
    clean: 0,
    same: 0,
    steps: new Map(),
    unfixed: new Map(),
  };
  const rest = { tried: 0, parsed: 0, steps: new Map(), unfixed: new Map() };
  const open = [];
  let fontPhrases = 0;
  for (const text of texts) {
    const seen = views(text, repair);
    const bucket = classify(seen);
    bump(buckets, bucket);
    for (const span of seen.delimiters.errors)
      bump(before, errorClass(span.error));
    for (const span of seen.repaired.errors)
      bump(after, errorClass(span.error));
    for (const [code, n] of seen.delimiters.strict) bump(strictBefore, code, n);
    for (const [code, n] of seen.repaired.strict) bump(strictAfter, code, n);
    for (const part of seen.delimiters.parts) {
      if (part.span && fonts.wordsAsText(part.span.tex) !== part.span.tex)
        fontPhrases++;
    }
    if (bucket === DONE.open) {
      open.push({
        text,
        errors: seen.repaired.errors.map((s) => errorClass(s.error)),
        leaks: seen.repaired.leaks,
      });
    }
    if (bucket === DONE.open && seen.repaired.errors.length) {
      rest.tried++;
      const attempt = repairLoop(seen.repaired, tools);
      if (attempt.parsed) rest.parsed++;
      for (const step of attempt.steps) bump(rest.steps, step);
      for (const left of attempt.unfixed) bump(rest.unfixed, left);
    }
    if (seen.delimiters.errors.length && bucket !== DONE.open) {
      loop.tried++;
      const attempt = repairLoop(seen.delimiters, tools);
      if (attempt.clean) loop.clean++;
      if (attempt.clean && attempt.shown === seen.repaired.shown) loop.same++;
      for (const step of attempt.steps) bump(loop.steps, step);
      for (const left of attempt.unfixed) bump(loop.unfixed, left);
    }
  }
  return {
    name,
    texts: texts.length,
    buckets: table(buckets),
    errorsBefore: table(before),
    errorsAfter: table(after),
    strictBefore: table(strictBefore),
    strictAfter: table(strictAfter),
    fontPhrases,
    loop: {
      tried: loop.tried,
      clean: loop.clean,
      same: loop.same,
      steps: table(loop.steps),
      unfixed: table(loop.unfixed),
    },
    rest: {
      tried: rest.tried,
      parsed: rest.parsed,
      steps: table(rest.steps),
      unfixed: table(rest.unfixed),
    },
    open,
  };
}

function lessonTexts() {
  const lessons = JSON.parse(
    gunzipSync(read("docs/baselines/grounding/lessons.json.gz")),
  );
  const texts = [];
  const collect = (value) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object")
      Object.values(value).forEach(collect);
  };
  for (const record of lessons.records) collect(record.lesson_wire ?? {});
  return texts.filter((text) => /\\|\$|<latex/.test(text));
}

const rows = (title, list) => {
  if (!list.length) return;
  console.log(`  ${title}`);
  for (const [key, count] of list)
    console.log(`  ${String(count).padStart(5)}  ${key}`);
};

function print(result) {
  console.log(`\n== ${result.name}: ${result.texts} texts`);
  rows("what the repair did, by text", result.buckets);
  rows(
    "KaTeX parse errors with only the delimiters found",
    result.errorsBefore,
  );
  rows("KaTeX parse errors left after the repair", result.errorsAfter);
  rows(
    "formulas that parse and that strict mode flags, by code (a formula with two codes counts under both), delimiters only",
    result.strictBefore,
  );
  rows("the same, after the repair", result.strictAfter);
  const { loop } = result;
  console.log(`  formulas the font-phrase rule changes: ${result.fontPhrases}`);
  console.log(
    `  KaTeX-driven loop on the ${loop.tried} texts with a formula that fails to parse and that the repair makes right: ${loop.clean} parse clean, ${loop.same} show what the rules show`,
  );
  rows("fixes the loop applied", loop.steps);
  rows("errors the loop could not fix", loop.unfixed);
  const { rest } = result;
  console.log(
    `  the same loop on the ${rest.tried} texts the repair leaves with a formula that does not parse: ${rest.parsed} parse after it`,
  );
  rows("fixes the loop applied", rest.steps);
  rows("errors the loop could not fix", rest.unfixed);
  if (argument("--list")) {
    for (const { text, errors, leaks } of result.open) {
      console.log(
        `  OPEN errors=${JSON.stringify(errors)} leaks=${leaks}: ${JSON.stringify(text).slice(0, 200)}`,
      );
    }
  }
}

const repair = {
  ...(await bundle("apps/web/src/lib/latex.ts")),
  ...(await bundle("apps/web/src/lib/latex-scan.ts")),
};
const fonts = await bundle("apps/web/src/lib/latex-fonts.ts");
const corpus = JSON.parse(read("tests/fixtures/math-repair.json"));
// The corpus lists failures that were found, not a sample of what the model
// writes. Its first cases are those of the earlier repair; the cases after them
// were written with the font rule, so they are reported apart.
const EARLIER_CASES = 486;
const inputs = (cases) => cases.map((c) => c.input);
const results = [
  measure(
    "repair corpus, the 486 earlier cases",
    inputs(corpus.cases.slice(0, EARLIER_CASES)),
    repair,
    fonts,
  ),
  measure(
    "repair corpus, the cases added with the font rule",
    inputs(corpus.cases.slice(EARLIER_CASES)),
    repair,
    fonts,
  ),
  // These lessons passed the server's repair before they were stored: their
  // maths is in <latex-*> tags. They show what the repair leaves, not what the
  // model wrote.
  measure(
    "grounding-study lessons, as stored after the server's repair",
    lessonTexts(),
    repair,
    fonts,
  ),
];
if (argument("--json")) console.log(JSON.stringify(results, null, 2));
else results.forEach(print);
