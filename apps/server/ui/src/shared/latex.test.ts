import { describe, expect, it } from "vitest";
import corpus from "../../../../../tests/fixtures/math-repair.json";
import { processLatex } from "./latex";
import { COMMANDS, ENVIRONMENTS, FUNCTIONS, NAMES } from "./latex-runs";

// The corpus writes maths as the server's tags; remark-math reads $ and $$.
// Only a pair of tags within its cap is maths: an unclosed tag, and a span over
// 3000 characters (20000 for a block), stay as they are.
const asDollars = (tagged: string) =>
  tagged.replace(
    /<latex-(block|inline)>([\s\S]*?)<\/latex-\1>/g,
    (pair, kind: string, maths: string) => {
      if (maths.length > (kind === "block" ? 20000 : 3000)) return pair;
      return kind === "block" ? `$$${maths}$$` : `$${maths}$`;
    },
  );

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
    const same = corpus.cases.filter((c) => c.input === c.tagged).length;
    expect(same).toBeGreaterThan(24);
    expect(corpus.cases.length - same).toBeGreaterThan(24);
  });

  it.each(corpus.cases)("$name", ({ input, tagged }) => {
    expect(processLatex(input)).toBe(asDollars(tagged));
  });

  it.each(corpus.cases)(
    "is stable when repeated: $name",
    ({ input, tagged }) => {
      expect(processLatex(asDollars(tagged))).toBe(asDollars(tagged));
      expect(processLatex(processLatex(input))).toBe(processLatex(input));
    },
  );

  it("holds the vocabulary the server holds", () => {
    expect(corpus.vocabulary).toEqual({
      commands: COMMANDS,
      functions: FUNCTIONS,
      names: NAMES,
      environments: ENVIRONMENTS,
    });
  });
});

// Each of these grows with the number of openers when a scan runs to the end of
// the text from every one. The cost of a repair is linear: quadrupling the
// input must not cost much more than four times as much.
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
  fences: "``` a ",
  "tilde fences": "~~~ a ",
  "unclosed tikz": "\\begin{tikzpicture} a ",
  "long command runs": "\\alpha + ",
  "indented code": "\n\n    a ",
  "list items and indents": "- a\n\n    b\n\n",
};
const SMALL = 4000;

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
    const small = seconds(unit.repeat(SMALL));
    const large = seconds(unit.repeat(SMALL * 4));
    expect(large).toBeLessThan(Math.max(small * 8, 0.05));
    expect(large).toBeLessThan(4);
  });
});
