import { describe, expect, it } from "vitest";
import corpus from "../../../../../tests/fixtures/math-repair.json";
import { processLatex } from "./latex";
import { FUNCTIONS, NAMES } from "./latex-runs";
import {
  COMMANDS,
  DISPLAY_ONLY_ENVIRONMENTS,
  ENVIRONMENTS,
  INFIX,
  NEEDS_ARGUMENT,
  NEEDS_TWO_ARGUMENTS,
} from "./latex-vocabulary";

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
    expect(processLatex("$|\\le")).toBe("\\$|$\\le$");
  });

  it("puts the sign of an amount before a formula into the formula", () => {
    expect(processLatex("cost = $5 \\times 3")).toBe(
      'cost = $\\char"24{}5 \\times 3$',
    );
  });

  it("restores a line break's length that an earlier web wrote as \\$$4pt]", () => {
    expect(processLatex("a\\$$4pt] b")).toBe("a\\\\[4pt] b");
  });
});

describe("the repair corpus the server's repair_reply is tested with", () => {
  it("has cases left alone, cases changed, and cases for each family", () => {
    const same = corpus.cases.filter((c) => c.input === c.web).length;
    expect(same).toBeGreaterThan(40);
    expect(corpus.cases.length - same).toBeGreaterThan(120);
    expect(corpus.cases.length).toBeGreaterThan(260);
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
      needsArgument: NEEDS_ARGUMENT,
      needsTwoArguments: NEEDS_TWO_ARGUMENTS,
      infix: INFIX,
      names: NAMES,
      functions: FUNCTIONS,
    });
  });
});

// Each of these grows with the number of openers when a scan runs to the end of
// the text from every one, or with the square of the length of a run. The cost
// of a repair is linear in the input, which is made long enough to measure.
const PATHOLOGICAL: Record<string, (copies: number) => string> = {
  "unclosed environments": (n) => "\\begin{pmatrix} 1 ".repeat(n),
  "unclosed tags": (n) => "<latex-inline>a ".repeat(n),
  "unclosed dollar pairs": (n) => "$$ a ".repeat(n),
  "unclosed brackets": (n) => "\\[ a ".repeat(n),
  "unclosed parentheses delimiters": (n) => "\\( a ".repeat(n),
  "single dollar signs": (n) => "$ a ".repeat(n),
  "unclosed braces": (n) => "\\frac{a ".repeat(n),
  "unclosed parentheses": (n) => "(a + \\frac12 ".repeat(n),
  backticks: (n) => "` a ".repeat(n),
  "double backticks": (n) => "`` a ".repeat(n),
  "fences with a body": (n) => "```\na\n```\nb\n".repeat(n),
  "unclosed fences": (n) => "```\na\n".repeat(n),
  "tilde fences": (n) => "~~~\na\n~~~\nb\n".repeat(n),
  "indented fences in lists": (n) => "- a\n\n    ```\n    b\n    ```\n\n".repeat(n),
  "block quote fences": (n) => "> ```\n> a\n> ```\n\n".repeat(n),
  "unclosed tikz": (n) => "\\begin{tikzpicture} a ".repeat(n),
  "unclosed pre": (n) => "<pre> a ".repeat(n),
  "long command runs": (n) => "\\alpha + ".repeat(n),
  "long runs of formulas": (n) => "\\alpha = 1 and \\beta ".repeat(n),
  "indented code": (n) => "\n\n    a ".repeat(n),
  "list items and indents": (n) => "- a\n\n    b\n\n".repeat(n),
  "operators after a command": (n) => "\\alpha " + "= + - * / ".repeat(n),
  "closing brackets after a command": (n) => "\\alpha ) ".repeat(n),
  "minus signs after a command": (n) => "\\alpha - ".repeat(n),
  "opening brackets before a command": (n) => "[ ".repeat(n) + "\\alpha",
  "closing brackets after commands": (n) => "\\alpha ] ".repeat(n),
  "table rows": (n) => "| a | \\alpha |\n".repeat(n),
  "letters": (n) => "a b c ".repeat(n),
  "labels": (n) => "a) b) ".repeat(n),
  "doubled backslashes": (n) => "\\\\[ x ".repeat(n),
  "spaces before an opener": (n) => " ".repeat(n) + "a \\[\nx\n\\]",
  "spaces after a closer": (n) => "a \\[\nx\n\\]" + " ".repeat(n) + "b",
  "tabs after a closer": (n) => "a \\[\nx\n\\]" + "\t".repeat(n) + "b",
  "spaces after a closer and nothing else": (n) => "a \\[\nx\n\\]" + " ".repeat(n),
  "spaces at the end of body lines": (n) => "a \\[\nx" + " ".repeat(n) + "\ny\n\\] b",
  "spaces before body lines": (n) => "a \\[\n" + " ".repeat(n) + "x\ny\n\\] b",
  "blank lines before a display": (n) => "\n".repeat(n) + "a \\[\nx\n\\] b",
  "spaces before a display in a quote": (n) => "> " + " ".repeat(n) + "a \\[\n> x\n> \\] b",
  "displays after text": (n) => "a \\[\nx\n\\] ".repeat(n),
  "displays after text, closed by punctuation": (n) => "a \\[\nx\n\\]. ".repeat(n),
  "displays on one line": (n) => "a \\[ x \\] ".repeat(n),
  "displays in block quotes": (n) => "> a \\[\n> x\n> \\] b\n".repeat(n),
  "displays in list items": (n) => "- a \\[\n  x\n  \\] b\n".repeat(n),
  "dots in text": (n) => "\\(\\text{a\u00b7b}\\) ".repeat(n),
  "subscripts in text": (n) => "\\(\\text{OCH_2CH_3}\\) ".repeat(n),
  "unclosed texts": (n) => "\\(\\text{a ".repeat(n),
  "many groups in one formula": (n) => "\\(" + "\\text{a\u00b7b}".repeat(n) + "\\)",
  "a long text with subscripts": (n) => "\\(\\text{" + "a_2".repeat(n) + "}\\)",
  "a long text with exponents": (n) => "\\(\\text{" + "m^2/".repeat(n) + "}\\)",
  "a long text with underscores": (n) => "\\(\\text{" + "_".repeat(n) + "}\\)",
  "a long text with escaped underscores": (n) => "\\(\\text{" + "\\_2".repeat(n) + "}\\)",
  "a long text with braces": (n) => "\\(\\text{" + "{a_2} ".repeat(n) + "}\\)",
  "unclosed font commands": (n) => "\\(\\mathrm{a ".repeat(n),
  "font commands with words": (n) => "\\(" + "\\mathrm{ab cd}".repeat(n) + "\\)",
  "a long group of words in a font command": (n) => "\\(\\mathrm{" + "ab ".repeat(n) + "}\\)",
  "spaces between a font command and its group": (n) => "\\(\\mathrm" + " ".repeat(n) + "{ab cd}\\)",
  "font commands with no group": (n) => "\\(\\mathrm ".repeat(n),
  "backslashes before a font command": (n) => "\\(" + "\\".repeat(n) + "\\mathrm{ab cd}\\)",
  "escaped font commands": (n) => "\\(a \\\\mathrm{ab cd} \\) ".repeat(n),
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

// A timing test: a second look when another process held the machine during the first.
describe("the cost of a repair", { retry: 2 }, () => {
  it.each(Object.keys(PATHOLOGICAL))("is linear: %s", (name) => {
    let copies = 1000;
    let small = seconds(PATHOLOGICAL[name](copies));
    while (small < 0.02 && copies < 64000) {
      copies *= 2;
      small = seconds(PATHOLOGICAL[name](copies));
    }
    // Eight times the input costs about eight times as much; a scan that is
    // quadratic costs sixty-four times, and load on the machine does not.
    const large = seconds(PATHOLOGICAL[name](copies * 8));
    expect(large).toBeLessThan(Math.max(small * 28, 0.2));
    expect(large).toBeLessThan(6);
  });
});
