import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineMarkdown } from "./markdown";

// The views' colours are content/design/tokens.json: light, and dark once the
// host's theme says so. These read the files as the build does.
const here = (path: string) => new URL(path, import.meta.url);
const text = (path: string) => readFileSync(here(path), "utf-8");

const tokens = JSON.parse(
  text("../../../../../content/design/tokens.json"),
) as { color: Record<string, { value: string; dark?: string }> };
const css = text("./tokens.css");

const declarations = (block: string) =>
  new Map(
    [...block.matchAll(/--color-([\w-]+): ([^;]+);/g)].map(
      ([, name, value]) => [name, value] as const,
    ),
  );
const lightBlock = /@theme \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const darkBlock =
  /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

describe("the views' palette", () => {
  it("is every colour of tokens.json at its light value", () => {
    const light = declarations(lightBlock);
    for (const [name, { value }] of Object.entries(tokens.color)) {
      expect(light.get(name), name).toBe(value);
    }
  });

  it("turns to the dark value of each colour that has one, under the host's theme", () => {
    const dark = declarations(darkBlock);
    const themed = Object.entries(tokens.color).filter(
      ([, { dark }]) => dark !== undefined,
    );
    expect(themed.length).toBeGreaterThan(0);
    expect([...dark.keys()]).toEqual(themed.map(([name]) => name));
    for (const [name, { dark: value }] of themed) {
      expect(dark.get(name), name).toBe(value);
    }
  });

  it("is not set again by the view's own stylesheet", () => {
    const own = text("./view.css");
    expect(own).toContain('@import "./tokens.css"');
    expect(own).not.toMatch(/--color-[\w-]+:/);
  });
});

describe("a view in a dark page", () => {
  it("declares both colour schemes, so no opaque canvas is painted behind it before its theme is known", () => {
    expect(text("./view.css")).toMatch(/color-scheme:\s*light dark/);
    const pages = readdirSync(here("../../views/")).filter((name) =>
      name.endsWith(".html"),
    );
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(text(`../../views/${page}`), page).toContain(
        '<meta name="color-scheme" content="light dark" />',
      );
    }
  });

  it("names no colour of its own in any component: a fixed colour would stay when the page turns dark", () => {
    const root = fileURLToPath(here("../"));
    const files = readdirSync(root, { recursive: true, encoding: "utf-8" })
      .filter((name) => /\.(?:tsx|ts)$/.test(name) && !/\.test\./.test(name))
      .map((name) => join(root, name));
    expect(files.length).toBeGreaterThan(20);

    const fixedColours = [
      // Tailwind's own white, black and palette steps.
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/,
      // A hex or functional colour in a colour property or an arbitrary value, so a link to "#section" is not one.
      /(?:color|background|fill|stroke|border|shadow|outline)\s*[:=][^;\n]*(?:#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|oklab)a?\()/i,
      /-\[(?:#[0-9a-f]{3,8}|(?:rgb|hsl|oklch)a?\([^\]]*\))\]/i,
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const pattern of fixedColours) {
        expect(source, `${file} ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("renders a formula KaTeX cannot read in the text's own colour, not KaTeX's red", () => {
    const html = renderToStaticMarkup(
      createElement(InlineMarkdown, { source: "a $\\frac{1$ b" }),
    );

    expect(html).toContain('class="katex-error"');
    expect(html).toContain("color:inherit");
    expect(html).not.toMatch(/cc0000/i);
  });
});
