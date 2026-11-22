import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import corpus from "../../../../tests/fixtures/math-repair.json";
import {
  MARKDOWN_REHYPE_PLUGINS,
  MARKDOWN_REMARK_PLUGINS,
} from "@/features/learn/lib/markdown-plugins";
import { processLatex } from "@/lib/latex";
import { COMMANDS, ENVIRONMENTS, FUNCTIONS, NAMES } from "@/lib/latex-runs";

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

describe("as the chat renders it", () => {
  // Without KaTeX's MathML annotation, which keeps the source of every formula.
  const html = (text: string) =>
    renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: MARKDOWN_REMARK_PLUGINS,
          rehypePlugins: MARKDOWN_REHYPE_PLUGINS,
        },
        processLatex(text),
      ),
    ).replace(/<annotation[\s\S]*?<\/annotation>/g, "");

  const screens = [
    "R(\\theta)=\\begin{pmatrix} \\cos\\theta & -\\sin\\theta\\\\[4pt] \\sin\\theta & \\ \\cos\\theta \\end{pmatrix}.",
    "\\bar{x} = \\underline{\\phantom{___}} \\qquad s = \\underline{\\phantom{___}}",
    "t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}} = \\underline{\\phantom{___}}",
    "For one-tailed df = n-1 = \\underline{\\phantom{___}}, the critical t value",
    "f(x) = \\sin(x) + \\cos(x)",
    "$\\begin{align} a &= 1 \\\\ b &= 2 \\end{align}$",
    "\\begin{pmatrix}1&2\\\\[1pc]3&4\\end{pmatrix}",
    "1. Step one:\n\n    Compute \\(x^2\\) and \\frac12 here.",
  ];

  it.each(screens)("%s is typeset, not shown as source", (text) => {
    const page = html(text);
    expect(page).toContain('class="katex');
    expect(page).not.toContain("katex-error");
    expect(page).not.toContain("\\begin");
    expect(page).not.toContain("\\underline");
    expect(page).not.toContain("\\sin");
    expect(page).not.toContain("\\frac");
  });

  it("leaves a fenced block alone", () => {
    const page = html("```sh\ncd $HOME/$USER\n```");
    expect(page).not.toContain("katex");
    expect(page).toContain("cd $HOME/$USER");
  });
});
