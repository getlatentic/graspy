import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

  it("names no colour of its own in a component: a fixed white or black would stay when the page turns dark", () => {
    const sources = [
      "./answer-options.tsx",
      "./question-card.tsx",
      "./question-block.tsx",
      "./markdown.tsx",
      "../lesson/button-styles.ts",
      "../lesson/lesson-view.tsx",
      "../lesson/slide.tsx",
      "../lesson/check.tsx",
      "../passage/passage-view.tsx",
      "../practice/practice-view.tsx",
    ];
    for (const source of sources) {
      expect(text(source), source).not.toMatch(
        /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)\b|#[0-9a-f]{3,8}\b/i,
      );
    }
  });
});
