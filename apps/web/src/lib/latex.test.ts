import { describe, expect, it } from "vitest";
import { processLatex } from "@/lib/latex";

describe("processLatex", () => {
  it("puts the tutor's formulas in remark-math's delimiters", () => {
    expect(processLatex("<latex-block>x^2</latex-block>")).toBe("$$x^2$$");
    expect(processLatex("a <latex-inline>x</latex-inline> b")).toBe("a $x$ b");
    expect(processLatex("\\[x\\] and \\(y\\)")).toBe("$$x$$ and $y$");
    expect(processLatex("no maths")).toBe("no maths");
  });
});
