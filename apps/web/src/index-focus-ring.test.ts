import { describe, expect, it } from "vitest";

// Read from disk: Vitest turns every CSS import into "". The module name is a variable so the
// browser tsconfig needs no node types.
async function stylesheet(): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: URL, encoding: "utf8") => string } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL("./index.css", import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );
}

describe("the focus ring", () => {
  it("is not outweighed by the rule that takes it off a heading or page only a program focuses", async () => {
    const css = await stylesheet();
    const ringEnd = css.indexOf(":not([data-own-focus]):focus-visible");
    const ringStart = css.lastIndexOf("}", ringEnd) + 1;
    const off = css.indexOf('[tabindex="-1"]:focus-visible');
    // The list of controls is in :where(), which adds no specificity, and the rule that removes
    // the ring comes after it: an :is() list took the specificity of its most specific item and won.
    expect(ringEnd).toBeGreaterThan(-1);
    const ring = css.slice(ringStart, ringEnd);
    expect(ring).toContain(":where(");
    expect(ring).not.toContain(":is(");
    expect(off).toBeGreaterThan(ringEnd);
    expect(css.slice(off, off + 200)).toContain("outline: none");
  });
});
