import { describe, expect, it } from "vitest";
// ?raw keeps this inside the browser tsconfig, with no node types.
import html from "../../index.html?raw";
import lockup from "../../public/brand/graspy-lockup-v1.svg?raw";

type ReadFile = (path: URL, encoding: "utf8") => string;

// Vitest turns every CSS import into "", even with ?raw, so the file is read from disk. The module
// name is a variable so the browser tsconfig needs no node types.
async function tokens(): Promise<string> {
  const fsModule = "node:fs";
  const { readFileSync }: { readFileSync: ReadFile } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL("../design/tokens.css", import.meta.url), "utf8");
}

const BOOT_STYLE = html.slice(
  html.indexOf("#boot {"),
  html.indexOf("</style>", html.indexOf("#boot {")),
);

describe("the page's first paint", () => {
  it("is drawn by the HTML alone, before the app's own element, with the logo inline", () => {
    const boot = html.indexOf('<div id="boot">');
    expect(boot).toBeGreaterThan(-1);
    expect(boot).toBeLessThan(html.indexOf('<div id="root">'));
    const ink = lockup.match(/<svg [^>]*>([\s\S]*)<\/svg>/)![1]!;
    expect(html).toContain(ink);
  });

  it("has no script of its own beyond the hashed boot script", () => {
    expect([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)]).toHaveLength(1);
  });

  // The page paints these before the stylesheet's variables exist, so each is written out.
  it.each(["canvas", "track", "accent", "accent-strong", "on-accent"])(
    "uses the design tokens' %s, light and dark",
    async (name) => {
      const css = await tokens();
      const value = new RegExp(`--color-${name}: (#[0-9a-f]{6})`, "i");
      const lowered = html.toLowerCase();
      expect(lowered).toContain(css.match(value)![1]!.toLowerCase());
      const dark = css
        .slice(css.indexOf("prefers-color-scheme: dark"))
        .match(value);
      if (name !== "accent-strong" && name !== "on-accent") {
        expect(lowered).toContain(dark![1]!.toLowerCase());
      }
    },
  );

  it("sizes everything in rem, so the adaptive root size scales it", () => {
    expect(BOOT_STYLE).not.toMatch(/\d(px|vw|vh|vmin|vmax)\b/);
  });

  it("offers another try after eight seconds with no script, and keeps still for reduced motion", () => {
    expect(BOOT_STYLE).toMatch(/animation: boot-in 1ms 8s forwards/);
    expect(BOOT_STYLE).toMatch(/animation: boot-out 1ms 8s forwards/);
    expect(BOOT_STYLE).toMatch(
      /prefers-reduced-motion: reduce\) \{ #boot \.bar i \{ animation: none/,
    );
    expect(html).toContain('<a class="again" href="">Try again</a>');
  });

  it("preloads the logo the loading screen draws next, so the hand-over shows no gap", () => {
    expect(html).toContain(
      '<link rel="preload" as="image" href="/brand/graspy-lockup-v1.svg"',
    );
  });
});
