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

describe("processLatex", () => {
  it("puts the tutor's formulas in remark-math's delimiters", () => {
    expect(processLatex("<latex-block>x^2</latex-block>")).toBe("$$x^2$$");
    expect(processLatex("a <latex-inline>x</latex-inline> b")).toBe("a $x$ b");
    expect(processLatex("\\[x\\] and \\(y\\)")).toBe("$$x$$ and $y$");
    expect(processLatex("no maths")).toBe("no maths");
  });

  it("keeps a line break's length: \\\\[4pt] is not a display delimiter", () => {
    expect(processLatex("a \\\\[4pt] b")).toBe("a \\\\[4pt] b");
    expect(processLatex("\\[a \\\\[2ex] b\\]")).toBe("$$a \\\\[2ex] b$$");
  });

  it("makes the maths of the screenshots maths", () => {
    expect(
      processLatex(
        "R(\\theta)=\\begin{pmatrix} \\cos\\theta & -\\sin\\theta\\\\[4pt] \\sin\\theta & \\ \\cos\\theta \\end{pmatrix}.",
      ),
    ).toBe(
      "$R(\\theta)=\\begin{pmatrix} \\cos\\theta & -\\sin\\theta\\\\[4pt] \\sin\\theta & \\ \\cos\\theta \\end{pmatrix}$.",
    );
    expect(
      processLatex(
        "\\bar{x} = \\underline{\\phantom{___}} \\qquad s = \\underline{\\phantom{___}}",
      ),
    ).toBe(
      "$\\bar{x} = \\underline{\\phantom{\\_\\_\\_}} \\qquad s = \\underline{\\phantom{\\_\\_\\_}}$",
    );
  });
});

describe("the repair corpus the server's repair_markdown is tested with", () => {
  it.each(corpus.cases)("$name", ({ input, tagged }) => {
    expect(processLatex(input)).toBe(processLatex(tagged));
  });

  it.each(corpus.cases)("is stable when repeated: $name", ({ input }) => {
    const once = processLatex(input);
    expect(processLatex(once)).toBe(once);
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

  it.each(corpus.cases.filter(({ input, tagged }) => input !== tagged))(
    "$name is typeset, not shown as source",
    ({ input }) => {
      const page = html(input);
      expect(page).toContain('class="katex');
      expect(page).not.toContain("katex-error");
      expect(page).not.toContain("\\begin");
      expect(page).not.toContain("\\underline");
    },
  );
});
