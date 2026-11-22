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

  const caseText = (name: string) => corpus.cases.find((c) => c.name === name)!.input;

  it("keeps a table's rows and puts a formula in its own cell", () => {
    const page = html(caseText("a table row with a formula is repaired cell by cell"));
    expect(count(page, /<th>/g)).toBe(2);
    expect(count(page, /<td>/g)).toBe(2);
    expect(count(page, /<td>1<\/td>/g)).toBe(1);
    expect(count(page, /<td><span class="katex"/g)).toBe(1);
    expect(page).not.toContain("katex-error");

    const cells = html(caseText("a table cell with a product"));
    expect(cells).not.toContain("katex-error");
    expect(html("| $x$ | \\frac{1}{2} |\n|---|---|\n| 1 | \\pi r^2 |")).toContain("<table>");
  });

  it("keeps bold and italic words and puts the formula after them in maths", () => {
    for (const [name, strong] of [
      ["bold before a formula", "<strong>x</strong>"],
      ["a bold step label before a formula", "<strong>Step 1:</strong>"],
      ["italics before a formula", "<em>n</em>"],
      ["a bold word before a command", "<strong>bold</strong>"],
    ]) {
      const page = html(caseText(name));
      expect(page).toContain(strong);
      expect(count(page, /class="katex"/g)).toBe(1);
      expect(page).not.toContain("katex-error");
    }
    const underscores = html(caseText("underscores that are emphasis"));
    expect(underscores).not.toContain("katex-error");
    expect(underscores).toContain("<em>x</em>");
  });

  it("keeps a link's address and text", () => {
    const page = html(caseText("a link before a formula"));
    expect(page).toContain('<a href="http://a.b">link</a>');
    expect(count(page, /class="katex"/g)).toBe(1);
    const inside = html(caseText("a command in a link's address is left in it"));
    expect(inside).toContain('<a href="http://a.b/%5Calpha">x</a>');
    expect(count(inside, /class="katex"/g)).toBe(1);
  });

  it("shows a dollar sign inside maths, and an amount before a formula", () => {
    const pen = html(caseText("a dollar sign in maths"));
    expect(count(pen, /class="katex"/g)).toBe(1);
    expect(pen).not.toContain("katex-error");
    expect(html(caseText("escaped dollars in a pair of dollar signs"))).not.toContain(
      "katex-error",
    );
    expect(html("cost = $5 \\times 3")).not.toContain("katex-error");
  });

  // A reply arrives a few characters at a time: no prefix of a reply shows a KaTeX
  // error, or the \char that stands for a dollar sign, where plain text was.
  const replies = [
    "Then \\(x = \\frac{a}{b}\\) holds",
    "Then \\[\\frac{a}{b} = \\sqrt{x}\\] holds",
    "Then x = \\frac{a}{b} + \\sqrt{2} holds",
    "It costs $5 \\times 3 = 15$ dollars, so $x \\le 5$",
    "Then $x = \\frac{a}{b}$ holds",
    "A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} here",
    "Then f(x) = \\left( \\frac{a}{b} \\right)^2 holds",
    "Then E = mc^2 \\text{ joules} and \\sqrt[3]{8} = 2",
  ];

  it.each(replies)("shows no error in any prefix of: %s", (reply) => {
    for (let length = 1; length <= reply.length; length++) {
      const page = html(reply.slice(0, length));
      const shown = page.replace(/<annotation[\s\S]*?<\/annotation>/g, "");
      expect(shown, reply.slice(0, length)).not.toContain("katex-error");
      expect(shown, reply.slice(0, length)).not.toContain("\\char");
    }
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
