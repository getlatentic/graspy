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
  html.indexOf("html { background"),
  html.indexOf("</style>", html.indexOf("html { background")),
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

  // The page paints these before the stylesheet's variables exist, so each is written out, in the
  // rule that uses it: a colour found elsewhere in the page would not do.
  const [LIGHT, DARK] = BOOT_STYLE.split(
    "@media (prefers-color-scheme: dark)",
  ) as [string, string];
  const colour = async (name: string, dark: boolean) => {
    const css = await tokens();
    const from = dark ? css.indexOf("prefers-color-scheme: dark") : 0;
    return css
      .slice(from)
      .match(new RegExp(`--color-${name}: (#[0-9a-f]{6})`, "i"))![1]!
      .toLowerCase();
  };
  const rule = (css: string, selector: string) =>
    css
      .toLowerCase()
      .match(
        new RegExp(`${selector.replace(/[.#]/g, "\\$&")} \\{([^}]*)\\}`),
      )![1]!;

  it("paints the canvas, track and accent of the design tokens, light", async () => {
    expect(rule(LIGHT, "#boot")).toContain(
      `background: ${await colour("canvas", false)}`,
    );
    expect(rule(LIGHT, "html")).toContain(
      `background: ${await colour("canvas", false)}`,
    );
    expect(rule(LIGHT, "#boot .bar")).toContain(
      `background: ${await colour("track", false)}`,
    );
    expect(rule(LIGHT, "#boot .bar i")).toContain(
      `background: ${await colour("accent", false)}`,
    );
    const again = rule(LIGHT, "#boot .again");
    expect(again).toContain(`background: ${await colour("accent", false)}`);
    expect(again).toContain(`${await colour("accent-strong", false)}`);
    expect(again).toContain(`color: ${await colour("on-accent", false)}`);
  });

  it("paints the canvas, track and accent of the design tokens, dark", async () => {
    expect(rule(DARK, "html, #boot")).toContain(
      `background: ${await colour("canvas", true)}`,
    );
    expect(rule(DARK, "#boot .bar")).toContain(
      `background: ${await colour("track", true)}`,
    );
    expect(rule(DARK, "#boot .bar i, #boot .again")).toContain(
      `background: ${await colour("accent", true)}`,
    );
  });

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

  it("tells a browser without script what it needs, and hides what would wait for one", () => {
    expect(html).toContain(
      "<noscript><p>Turn on JavaScript to use graspy.</p></noscript>",
    );
    expect(html).toMatch(
      /<noscript>\s*<style>[\s\S]*#boot \.bar, #boot \.again \{ display: none; \}/,
    );
  });
});
