import { describe, expect, it } from "vitest";

// Read from disk: Vitest turns every CSS import into "". The module name is a variable so the
// browser tsconfig needs no node types.
async function read(path: string): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: URL, encoding: "utf8") => string } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
}

describe("the root size", () => {
  it("follows the shorter axis the browser reports, with the browser's default size as its floor (not a fixed 16px) and no ceiling", async () => {
    const css = await read("./index.css");
    expect(css).toContain(
      "html { font-size: max(100%, min(1.0417vw, 1.8519vh)); }",
    );
  });

  it("swaps the axes when the screen is held upright", async () => {
    const css = await read("./index.css");
    expect(css).toContain(
      "@media (orientation: portrait) { html { font-size: max(100%, min(1.0417vh, 1.8519vw)); } }",
    );
  });

  it("gives 20px at 1920x1080, 40px at 3840x2160 and 16px on a phone and at 1280x720", () => {
    const size = (w: number, h: number, portrait = false) =>
      Math.max(
        16,
        portrait
          ? Math.min(0.010417 * h, 0.018519 * w)
          : Math.min(0.010417 * w, 0.018519 * h),
      );
    expect(size(1920, 1080)).toBeCloseTo(20, 1);
    expect(size(3840, 2160)).toBeCloseTo(40, 1);
    expect(size(1280, 720)).toBe(16);
    expect(size(390, 844, true)).toBe(16);
    expect(size(768, 1024, true)).toBe(16);
  });

  it("is the only thing that scales the interface: no zoom scope, no device or breakpoint steps", async () => {
    const css = await read("./index.css");
    expect(css).not.toMatch(/\.zoom|--zoom/);
    expect(css).not.toMatch(/data-device="tv"\] \{ font-size/);
    expect(css).not.toMatch(/--breakpoint-[345]xl/);
  });
});

describe("the pointer", () => {
  it("is a hand over what can be pressed, set once in the base layer, and never over what is disabled", async () => {
    const css = await read("./index.css");
    const base = css.slice(css.indexOf("@layer base"));
    for (const selector of [
      "button,",
      '[role="button"]',
      '[role="option"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="menuitem"]',
      "a[href]",
      "summary",
      "select,",
      'label:has(input[type="checkbox"], input[type="radio"])',
      'input[role="combobox"]',
    ]) {
      expect(base, selector).toContain(selector);
    }
    expect(base).toContain(
      '):not(:disabled, [aria-disabled="true"], label:has(:disabled)) { cursor: pointer; }',
    );
    expect(css.match(/cursor: pointer/g)).toHaveLength(1);
  });

  it("is the text cursor only for a field that takes text, and not-allowed for what is disabled", async () => {
    const css = await read("./index.css");
    expect(css).toMatch(
      /textarea:not\(\[readonly\], :disabled\) \{ cursor: text; \}/,
    );
    expect(css).toMatch(
      /:disabled, \[aria-disabled="true"\], label:has\(:disabled\) \{ cursor: not-allowed; \}/,
    );
  });
});

describe("the scrollbars", () => {
  it("makes the select's list scrollbar at least 1.25rem wide and keeps the page still behind it", async () => {
    const css = await read("./index.css");
    expect(css).toContain("overscroll-behavior: contain");
    const wide = /\.pick-scroll::-webkit-scrollbar \{ width: ([\d.]+)rem; \}/;
    expect(Number(wide.exec(css)?.[1])).toBeGreaterThanOrEqual(1.25);
    expect(css).toMatch(
      /\.pick-scroll::-webkit-scrollbar-thumb \{[^}]*background: var\(--color-ink\)/,
    );
  });

  it("hides the bar of the fields and of the onboarding and sign-in pages on a TV and a touch screen only, not for a mouse", async () => {
    const css = await read("./index.css");
    expect(css).toContain("@media (pointer: coarse) {");
    expect(css).not.toContain("min-width: 80rem");
    expect(css).toContain(
      'html[data-device="tv"] .quiet-scroll::-webkit-scrollbar',
    );
    expect(css).toContain("html:has(.art-ground)::-webkit-scrollbar");
    expect(css).toMatch(/\.quiet-scroll,[^{]*\{ scrollbar-width: none; \}/);
  });
});

describe("the split layout", () => {
  it("is a container query on the page's own width, in landscape, tall enough", async () => {
    const css = await read("./index.css");
    expect(css).toMatch(
      /@custom-variant split \{ @media \(orientation: landscape\) and \(min-height: 40rem\) \{ @container \(min-width: 64rem\) \{ @slot; \} \} \}/,
    );
  });
});
