import { describe, expect, it } from "vitest";
import corpus from "../../../../../tests/fixtures/math-repair.json";
import { processLatex } from "./latex";

describe("processLatex", () => {
  it.each([
    ["<latex-inline>x^2</latex-inline>", "$x^2$"],
    ["<latex-block>x^2</latex-block>", "$$x^2$$"],
    ["\\(x^2\\) and \\[y\\]", "$x^2$ and $$y$$"],
    ["$x$ stays", "$x$ stays"],
  ])("writes %j as KaTeX reads it", (source, expected) => {
    expect(processLatex(source)).toBe(expected);
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
