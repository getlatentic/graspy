import { describe, expect, it } from "vitest";
import corpus from "../../../../../tests/fixtures/math-repair.json";
import { processLatex } from "./latex";

// The corpus writes maths as the server's tags; remark-math reads $ and $$.
const asDollars = (tagged: string) =>
  tagged.replace(/<\/?latex-block>/g, "$$$$").replace(/<\/?latex-inline>/g, "$");

describe("processLatex", () => {
  it("puts the tutor's formulas in remark-math's delimiters", () => {
    expect(processLatex("<latex-block>x^2</latex-block>")).toBe("$$x^2$$");
    expect(processLatex("a <latex-inline>x</latex-inline> b")).toBe("a $x$ b");
    expect(processLatex("\\[x\\] and \\(y\\)")).toBe("$$x$$ and $y$");
    expect(processLatex("no maths")).toBe("no maths");
    expect(processLatex("")).toBe("");
  });
});

describe("the repair corpus the server's repair_reply is tested with", () => {
  it("has cases left alone and cases changed", () => {
    expect(corpus.cases.filter((c) => c.input === c.tagged).length).toBeGreaterThan(9);
    expect(corpus.cases.filter((c) => c.input !== c.tagged).length).toBeGreaterThan(9);
  });

  it.each(corpus.cases)("$name", ({ input, tagged }) => {
    expect(processLatex(input)).toBe(asDollars(tagged));
  });

  it.each(corpus.cases)("is stable when repeated: $name", ({ input, tagged }) => {
    expect(processLatex(asDollars(tagged))).toBe(asDollars(tagged));
    expect(processLatex(processLatex(input))).toBe(processLatex(input));
  });
});

// The work on a long reply is bounded: each of these took seconds or more
// when a scan could run to the end of the text from every opener.
const PATHOLOGICAL: Record<string, string> = {
  "unclosed environments": "\\begin{pmatrix} 1 ".repeat(8000),
  "unclosed tags": "<latex-inline>a ".repeat(8000),
  "unclosed dollar pairs": "$$ a ".repeat(20000),
  "unclosed brackets": "\\[ a ".repeat(20000),
  "unclosed braces": "\\frac{a ".repeat(12000),
  "unclosed parentheses": "(a + \\frac12 ".repeat(8000),
  backticks: "` a ".repeat(30000),
  fences: "``` a ".repeat(20000),
  "long command runs": "\\alpha + ".repeat(30000),
};

describe("a long reply", () => {
  it.each(Object.keys(PATHOLOGICAL))("%s is repaired in bounded time", (name) => {
    const started = performance.now();
    processLatex(PATHOLOGICAL[name]);
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
