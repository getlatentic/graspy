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

describe("the overscan margin", () => {
  it("is 0 on a small screen and 5% of the viewport from 100rem wide", async () => {
    const css = await stylesheet();
    expect(css).toMatch(/:root \{ --overscan-x: 0px; --overscan-y: 0px; \}/);
    expect(css).toMatch(
      /@media \(min-width: 100rem\) \{ :root \{ --overscan-x: 5vw; --overscan-y: 5vh; \} \}/,
    );
  });

  it("names no device, and sets no padding of its own on the page or a shell", async () => {
    const css = await stylesheet();
    expect(css).not.toMatch(/data-device[^{]*\{[^}]*overscan/);
    expect(css).not.toMatch(/safe-frame|--page-gutter/);
  });

  it("keeps scroll padding for pages with a sticky header only", async () => {
    const css = await stylesheet();
    expect(css).toMatch(/html:has\(\.sticky-header\) \{ scroll-padding-top:/);
    expect(css).not.toMatch(/(^|\} )html \{[^}]*scroll-padding-top/);
    expect(css).toMatch(
      /html \{ scroll-padding-bottom: var\(--overscan-y\); scroll-padding-inline-end: var\(--overscan-x\); \}/,
    );
  });
});
