import { describe, expect, it, vi } from "vitest";
import {
  MOST_ERROR_CHARS,
  MOST_FORMULAS,
  MOST_FORMULA_CHARS,
  MOST_TOTAL_CHARS,
  checkFormula,
  handleMathsCheck,
} from "../src/maths-check";

// The agents router and the Learner need the Workers runtime: the door only has to reach this check first.
vi.mock("agents", () => ({ routeAgentRequest: async () => null }));
vi.mock("../src/learner", () => ({ Learner: class {} }));

function post(body: unknown, method = "POST"): Request {
  return new Request("https://tutor/maths/check", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

async function check(body: unknown) {
  const response = await handleMathsCheck(post(body));
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe("a formula KaTeX can render", () => {
  it.each([
    "\\frac{1}{2} + \\frac{1}{3} = \\frac{5}{6}",
    "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}",
    "\\underline{\\phantom{\\_\\_\\_}} + 3 = 7",
    "\\bar{x} = \\frac{\\sum x_i}{n}",
    "x \\le 3 \\text{ or } x > 8",
    "\\ce{2H2 + O2 -> 2H2O}",
  ])("passes %s", (formula) => {
    expect(checkFormula(formula)).toEqual({ ok: true });
  });

  it("accepts an environment that only display mode allows", () => {
    expect(checkFormula("\\begin{align} a &= b \\\\ c &= d \\end{align}")).toEqual({ ok: true });
  });
});

describe("a formula KaTeX rejects", () => {
  it("says why in a plain sentence, with where it found the trouble", () => {
    expect(checkFormula("1 + \\foo{2}")).toEqual({ ok: false, error: "Undefined control sequence: \\foo", at: 4 });
  });

  it("carries none of KaTeX's own prefix, position text or underline marks", () => {
    for (const formula of ["\\frac{1}{", "x^^2", "\\begin{matrix} 1 \\end{pmatrix}", "a_b_c", "\\ce{H2O"]) {
      const result = checkFormula(formula);
      expect(result.ok, formula).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/ParseError|KaTeX parse error|at position|̲/);
        expect(result.error.length).toBeLessThanOrEqual(MOST_ERROR_CHARS);
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  });

  it("names a worksheet blank typed as underscores", () => {
    expect(checkFormula("\\underline{\\phantom{___}}")).toMatchObject({ ok: false, error: expect.stringContaining("Expected group after") });
  });

  it("cuts a very long message", () => {
    const result = checkFormula(`\\${"a".repeat(1500)}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeLessThanOrEqual(MOST_ERROR_CHARS);
  });
});

describe("POST /maths/check", () => {
  it("answers one result per formula, in order", async () => {
    const { status, body } = await check({ formulas: ["x^2", "\\bad", "\\frac{1}{2}"] });
    expect(status).toBe(200);
    expect(body.results).toEqual([
      { ok: true },
      { ok: false, error: "Undefined control sequence: \\bad", at: 0 },
      { ok: true },
    ]);
  });

  it("takes the most formulas, each of the most characters, and no more", async () => {
    const most = Array.from({ length: MOST_FORMULAS }, () => "x");
    expect((await check({ formulas: most })).status).toBe(200);
    expect((await check({ formulas: [...most, "x"] })).status).toBe(413);

    const long = `${"x".repeat(MOST_FORMULA_CHARS - 1)}`;
    expect((await check({ formulas: [long] })).status).toBe(200);
    expect((await check({ formulas: [`${long}xx`] })).status).toBe(413);
  });

  it("caps the total", async () => {
    const each = MOST_TOTAL_CHARS / 4;
    expect((await check({ formulas: Array(4).fill("x".repeat(each)) })).status).toBe(200);
    expect((await check({ formulas: [...Array(4).fill("x".repeat(each)), "x"] })).status).toBe(413);
  });

  it.each([
    [{}],
    [{ formulas: [] }],
    [{ formulas: "x" }],
    [{ formulas: [1] }],
    ["not json"],
    ["null"],
  ])("refuses %j", async (body) => {
    expect((await check(body)).status).toBe(400);
  });

  it("answers only POST", async () => {
    expect((await handleMathsCheck(post(null, "GET"))).status).toBe(405);
  });

  it("does not log the formulas", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
    await check({ formulas: ["secret \\bad", "ok"] });
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("keeps a worst-case request quick", async () => {
    const hard = "\\frac{".repeat(300);
    const started = performance.now();
    await check({ formulas: Array(4).fill(hard.slice(0, MOST_TOTAL_CHARS / 4)) });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("the Worker's door", () => {
  it("answers /maths/check before the agents router sees the request", async () => {
    const { default: worker } = await import("../src/index");
    const response = await worker.fetch(post({ formulas: ["x^2"] }) as never, {} as Env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ ok: true }] });
  });
});
