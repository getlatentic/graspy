import { describe, expect, it } from "vitest";
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
});
