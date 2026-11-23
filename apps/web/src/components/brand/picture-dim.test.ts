import { describe, expect, it } from "vitest";
import { ROOT_SIZE_LANDSCAPE, ROOT_SIZE_PORTRAIT } from "./art-urls";

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
      /prefers-color-scheme: dark\) \{\s*:root \{\s*--picture-filter: brightness\(0\.9\);/,
    );
    expect(css).toMatch(/:root \{\s*--picture-filter: none;/);
    expect(css).toMatch(/\.theme-light \{\s*--picture-filter: none;/);
    expect(css).toMatch(
      /@utility picture-dim \{\s*filter: var\(--picture-filter\);/,
    );
  });
});

describe("picture sizes", () => {
  it("read the root font size from the expressions index.css sets", async () => {
    const css = await indexCss();
    const rootSize = (opening: string) =>
      new RegExp(`${opening}\\s*html \\{\\s*font-size: ([^;]+);`)
        .exec(css)?.[1]
        ?.replace("100%", "1rem");
    expect(rootSize("\\*/")).toBe(ROOT_SIZE_LANDSCAPE);
    expect(rootSize("\\(orientation: portrait\\) \\{")).toBe(
      ROOT_SIZE_PORTRAIT,
    );
  });
});
