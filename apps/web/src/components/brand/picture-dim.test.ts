import { describe, expect, it } from "vitest";

type ReadFile = (path: URL, encoding: "utf8") => string;

// Vitest turns every CSS import into "", so the file is read from disk. The module name is a
// variable so the browser tsconfig needs no node types.
async function indexCss(): Promise<string> {
  const fsModule = "node:fs";
  const { readFileSync }: { readFileSync: ReadFile } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL("../../index.css", import.meta.url), "utf8");
}

describe("picture dimming", () => {
  it("dims only under the dark colour set, never in a `.theme-light` subtree", async () => {
    const css = await indexCss();
    expect(css).toMatch(
      /prefers-color-scheme: dark\) \{\s*:root \{\s*--picture-brightness: 0\.9;/,
    );
    expect(css).toMatch(/\.theme-light \{\s*--picture-brightness: 1;/);
    expect(css).toMatch(
      /@utility picture-dim \{\s*filter: brightness\(var\(--picture-brightness\)\);/,
    );
  });
});
