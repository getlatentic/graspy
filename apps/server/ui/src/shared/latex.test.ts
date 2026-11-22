import { describe, expect, it } from "vitest";
import corpus from "../../../../../tests/fixtures/math-repair.json";
import { processLatex } from "./latex";
import { COMMANDS, DISPLAY_ONLY_ENVIRONMENTS, ENVIRONMENTS, NAMES } from "./latex-runs";

describe("processLatex", () => {
  it("puts the tutor's formulas in remark-math's delimiters", () => {
    expect(processLatex("<latex-block>x^2</latex-block>")).toBe("$$x^2$$");
    expect(processLatex("a <latex-inline>x</latex-inline> b")).toBe("a $x$ b");
    expect(processLatex("\\[x\\] and \\(y\\)")).toBe("$$x$$ and $y$");
    expect(processLatex("no maths")).toBe("no maths");
    expect(processLatex("")).toBe("");
  });

  it("writes a dollar sign that opens no maths as \\$", () => {
    expect(processLatex("It costs $5 and $10")).toBe("It costs \\$5 and \\$10");
    expect(processLatex("Let $x\\le 5 be fine")).toBe("Let \\$$x\\le 5$ be fine");
    expect(processLatex("$|\\le")).toBe("\\$$|\\le$");
  });

  it("restores a line break's length that an earlier web wrote as \\$$4pt]", () => {
    expect(processLatex("a\\$$4pt] b")).toBe("a\\\\[4pt] b");
  });
});

describe("the repair corpus the server's repair_reply is tested with", () => {
  it("has cases left alone, cases changed, and cases for each family", () => {
    const same = corpus.cases.filter((c) => c.input === c.web).length;
    expect(same).toBeGreaterThan(40);
    expect(corpus.cases.length - same).toBeGreaterThan(100);
    expect(corpus.cases.length).toBeGreaterThan(180);
  });

  it.each(corpus.cases)("$name", ({ input, web }) => {
    expect(processLatex(input)).toBe(web);
  });

  it.each(corpus.cases)("is stable when repeated: $name", ({ input, web }) => {
    expect(processLatex(web)).toBe(web);
    expect(processLatex(processLatex(input))).toBe(processLatex(input));
  });

  it("holds the vocabulary the server holds", () => {
    expect(corpus.vocabulary).toEqual({
      commands: COMMANDS,
      environments: ENVIRONMENTS,
      displayOnlyEnvironments: DISPLAY_ONLY_ENVIRONMENTS,
      names: NAMES,
    });
  });
});

// Each of these grows with the number of openers when a scan runs to the end of
// the text from every one. The cost of a repair is linear in the input, which
// is made long enough to measure.
const PATHOLOGICAL: Record<string, string> = {
  "unclosed environments": "\\begin{pmatrix} 1 ",
  "unclosed tags": "<latex-inline>a ",
  "unclosed dollar pairs": "$$ a ",
  "unclosed brackets": "\\[ a ",
  "unclosed parentheses delimiters": "\\( a ",
  "single dollar signs": "$ a ",
  "unclosed braces": "\\frac{a ",
  "unclosed parentheses": "(a + \\frac12 ",
  backticks: "` a ",
  "fences with a body": "```\na\n```\nb\n",
  "unclosed fences": "```\na\n",
  "tilde fences": "~~~\na\n~~~\nb\n",
  "indented fences in lists": "- a\n\n    ```\n    b\n    ```\n\n",
  "block quote fences": "> ```\n> a\n> ```\n\n",
  "unclosed tikz": "\\begin{tikzpicture} a ",
  "unclosed pre": "<pre> a ",
  "long command runs": "\\alpha + ",
  "long runs of formulas": "\\alpha = 1 and \\beta ",
  "indented code": "\n\n    a ",
  "list items and indents": "- a\n\n    b\n\n",
};

function seconds(text: string): number {
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const started = performance.now();
    processLatex(text);
    best = Math.min(best, (performance.now() - started) / 1000);
  }
  return best;
}

describe("the cost of a repair", () => {
  it.each(Object.keys(PATHOLOGICAL))("is linear: %s", (name) => {
    const unit = PATHOLOGICAL[name];
    let copies = 1000;
    let small = seconds(unit.repeat(copies));
    while (small < 0.02 && copies < 64000) {
      copies *= 2;
      small = seconds(unit.repeat(copies));
    }
    // Eight times the input costs about eight times as much; a scan that is
    // quadratic costs sixty-four times, and load on the machine does not.
    const large = seconds(unit.repeat(copies * 8));
    expect(large).toBeLessThan(Math.max(small * 28, 0.2));
    expect(large).toBeLessThan(6);
  });
});
