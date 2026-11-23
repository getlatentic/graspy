import { describe, expect, it } from "vitest";

// Read from disk: Vitest turns every CSS import into "".
async function stylesheet(): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: URL, encoding: "utf8") => string } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL("./index.css", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
}

describe("the page gutter", () => {
  it("is the device's safe area on a small screen and 5% of the viewport from 100rem wide", async () => {
    const css = await stylesheet();
    const wide = css.slice(css.indexOf("@media (min-width: 100rem)"));
    expect(css).toMatch(
      /--page-gutter: max\( env\(safe-area-inset-left, 0px\)/,
    );
    expect(wide).toMatch(/--page-gutter: max\(.*?, 5vw \)/);
    expect(wide).toMatch(/--page-gutter-block: max\(.*?, 5vh \)/);
  });

  it("is applied by utilities that keep the background to the edge, and names no device", async () => {
    const css = await stylesheet();
    expect(css).toMatch(
      /@utility safe-frame \{ padding-inline: var\(--page-gutter\); padding-block: var\(--page-gutter-block\); \}/,
    );
    expect(css).not.toMatch(/data-device[^{]*\{[^}]*page-gutter/);
  });
});
