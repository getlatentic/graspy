import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import "katex/dist/contrib/mhchem.mjs";
import { describe, expect, it } from "vitest";
import corpus from "../../../../tests/fixtures/math-repair.json";
import {
  MARKDOWN_REHYPE_PLUGINS,
  MARKDOWN_REMARK_PLUGINS,
} from "@/features/learn/lib/markdown-plugins";
import { processLatex } from "@/lib/latex";

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

const count = (page: string, pattern: RegExp) => page.match(pattern)?.length ?? 0;

// A case that is one formula and nothing else: its tags hold all of its input.
const formulas = corpus.cases.filter(
  (c) => c.tagged === `<latex-inline>${c.input}</latex-inline>`,
);

describe("a formula the tutor wrote with no delimiters, as the chat renders it", () => {
  it("is the corpus's formulas, as many as were found wanting", () => {
    expect(formulas.length).toBeGreaterThan(60);
  });

  it.each(formulas.map((c) => c.input))("%s is one typeset span", (input) => {
    const page = html(input);
    expect(count(page, /class="katex"/g)).toBe(1);
    expect(page).not.toContain("katex-error");
    expect(page).not.toContain("$");
  });
});

describe("the chat's maths and its dollar signs", () => {
  it("shows the screenshots' formulas as maths", () => {
    for (const text of [
      "R(\\theta)=\\begin{pmatrix} \\cos\\theta & -\\sin\\theta\\\\[4pt] \\sin\\theta & \\ \\cos\\theta \\end{pmatrix}.",
      "R(\\theta)=\\begin{pmatrix} \\cos\\theta & -\\sin\\theta\\$$4pt] \\sin\\theta & \\ \\cos\\theta \\end{pmatrix}.",
      "\\bar{x} = \\underline{\\phantom{___}} \\qquad s = \\underline{\\phantom{___}}",
      "t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}} = \\underline{\\phantom{___}}",
      "1. Step one:\n\n    Compute \\(x^2\\) and \\frac12 here.",
    ]) {
      const page = html(text);
      expect(page).toContain('class="katex');
      expect(page).not.toContain("katex-error");
      expect(page).not.toContain("\\begin");
      expect(page).not.toContain("\\underline");
      expect(page).not.toContain("\\frac");
    }
  });

  it("shows dollar signs that are not maths as dollar signs", () => {
    const shell = html("Run echo $HOME and then echo $PATH now");
    expect(shell).toContain("Run echo $HOME and then echo $PATH now");
    expect(shell).not.toContain("katex");

    const price = html("Tom has $5 and buys \\frac12 + 1 kg");
    expect(count(price, /class="katex"/g)).toBe(1);
    expect(price).toContain("Tom has $5 and buys");
    expect(price).not.toContain("katex-error");

    const bash = html(
      "In bash $HOME holds the path; for the formula use \\frac{a}{b} + 1 here.",
    );
    expect(count(bash, /class="katex"/g)).toBe(1);
    expect(bash).toContain("In bash $HOME holds the path;");
  });

  it("leaves code alone", () => {
    for (const code of [
      "```sh\ncd $HOME/$USER\n```",
      "> ```python\n> x = \\alpha + \\beta\n> ```",
      "- a\n\n    ```\n    \\alpha + \\beta\n    ```",
      "<pre>\nx = \\alpha + $HOME\n</pre>",
    ]) {
      expect(html(code)).not.toContain("katex");
    }
  });
});
