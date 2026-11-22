/**
 * Whether LaTeX renders, asked of KaTeX itself.
 *
 * The tutor model writes maths the learner's browser then renders with KaTeX. It calls this through the
 * API Worker's service binding before it writes an answer, and corrects any formula that fails from the
 * error. The options are the web app's (apps/web/src/features/learn/lib/markdown-plugins.ts) with
 * `throwOnError` on, so an unparsable formula is an error here and not source text there; `trust` stays off
 * because the formulas echo what a learner typed. mhchem is loaded as the web app loads it, for \ce.
 *
 * Formulas are a learner's words: they are never logged.
 */
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";

export const MOST_FORMULAS = 20;
export const MOST_FORMULA_CHARS = 2000;
export const MOST_TOTAL_CHARS = 8000;
export const MOST_ERROR_CHARS = 200;

export type FormulaResult = { ok: true } | { ok: false; error: string; at?: number };

const OPTIONS = { strict: false, trust: false, throwOnError: true } as const;
const DISPLAY_ONLY = /can be used only in display mode/;

/** Why a formula cannot be rendered, as one short plain sentence, and where KaTeX found it. */
function failure(error: unknown): FormulaResult {
  const parse = error instanceof katex.ParseError ? error : null;
  const said = parse?.rawMessage ?? (error instanceof Error ? error.message : String(error));
  const plain = said
    .replace(/^KaTeX parse error:\s*/i, "")
    .replace(/^ParseError:\s*/i, "")
    .replace(/\s+at position \d+:.*$/s, "")
    .replace(/[̲\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plain.length > MOST_ERROR_CHARS ? `${plain.slice(0, MOST_ERROR_CHARS - 1)}…` : plain;
  const position = parse?.position;
  return typeof position === "number" && position >= 0
    ? { ok: false, error: sentence, at: position }
    : { ok: false, error: sentence };
}

/** Inline first, as `$...$` renders it; a formula only display mode accepts is fine as `$$...$$`. */
export function checkFormula(formula: string): FormulaResult {
  try {
    katex.renderToString(formula, { ...OPTIONS, displayMode: false });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof Error && DISPLAY_ONLY.test(error.message))) return failure(error);
  }
  try {
    katex.renderToString(formula, { ...OPTIONS, displayMode: true });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

type Refusal = { status: 400 | 413; detail: string };

/** The reason a request is refused, if it is: a malformed list is 400, one over a cap 413. */
function refusalOf(formulas: unknown): Refusal | null {
  if (!Array.isArray(formulas) || formulas.length === 0 || formulas.some((f) => typeof f !== "string")) {
    return { status: 400, detail: "formulas must be a non-empty list of strings" };
  }
  const list = formulas as string[];
  if (list.length > MOST_FORMULAS) return { status: 413, detail: `at most ${MOST_FORMULAS} formulas` };
  if (list.some((f) => f.length > MOST_FORMULA_CHARS)) {
    return { status: 413, detail: `a formula is at most ${MOST_FORMULA_CHARS} characters` };
  }
  if (list.reduce((sum, f) => sum + f.length, 0) > MOST_TOTAL_CHARS) {
    return { status: 413, detail: `at most ${MOST_TOTAL_CHARS} characters in all` };
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** POST {formulas: string[]} answers {results: [{ok: true} | {ok: false, error, at?}]}, in the same order. */
export async function handleMathsCheck(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ detail: "method not allowed" }, 405);
  let body: { formulas?: unknown } | null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "a JSON body is required" }, 400);
  }
  const refusal = refusalOf(body?.formulas);
  if (refusal) return json({ detail: refusal.detail }, refusal.status);
  return json({ results: (body?.formulas as string[]).map(checkFormula) });
}
