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
  return readFileSync(new URL("./index.css", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
}

type Rule = { selectors: string[]; body: string; at: number };

/** The rules at the top level of the sheet, with the selector list split on its top-level commas. */
function rules(css: string): Rule[] {
  const found: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    const selectors: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of match[1]) {
      if ("([".includes(char)) depth += 1;
      if (")]".includes(char)) depth -= 1;
      if (char === "," && depth === 0) {
        selectors.push(current.trim());
        current = "";
      } else current += char;
    }
    selectors.push(current.trim());
    found.push({ selectors, body: match[2], at: match.index ?? 0 });
  }
  return found;
}

/** Specificity as a single comparable number: ids, classes and attributes, then elements. */
function specificity(selector: string): number {
  let ids = 0;
  let classes = 0;
  let elements = 0;
  const inner = (text: string) => {
    let rest = text;
    for (;;) {
      const open = /:(where|is|not|has)\(/.exec(rest);
      if (!open) break;
      let depth = 1;
      let end = open.index + open[0].length;
      while (depth > 0 && end < rest.length) {
        if (rest[end] === "(") depth += 1;
        if (rest[end] === ")") depth -= 1;
        end += 1;
      }
      const argument = rest.slice(open.index + open[0].length, end - 1);
      if (open[1] === "where") {
        // adds nothing
      } else if (open[1] === "not" || open[1] === "is") {
        const best = argument
          .split(/,(?![^(]*\))/)
          .map(specificity)
          .reduce((a, b) => Math.max(a, b), 0);
        ids += Math.floor(best / 10000);
        classes += Math.floor((best % 10000) / 100);
        elements += best % 100;
      }
      rest = rest.slice(0, open.index) + " " + rest.slice(end);
    }
    ids += (rest.match(/#[\w-]+/g) ?? []).length;
    classes += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
    elements += (rest.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  };
  inner(selector);
  return ids * 10000 + classes * 100 + elements;
}

describe("the focus ring", () => {
  it("is outweighed by neither rule that takes it off, and they come after it", async () => {
    const all = rules(await stylesheet());
    const ring = all.filter((rule) => rule.body.includes("outline: calc"));
    const off = all.filter((rule) => rule.body.includes("outline: none"));
    // The ring on :focus-visible and on :focus in remote mode, and the removal for a heading or a page
    // that only a program focuses (tabindex -1), for each.
    expect(ring.length).toBeGreaterThan(0);
    const ringSelectors = ring.flatMap((rule) => rule.selectors);
    const offRule = off.find((rule) =>
      rule.selectors.some((selector) => selector.includes('[tabindex="-1"]')),
    );
    expect(ringSelectors).toHaveLength(2);
    expect(offRule?.selectors).toHaveLength(2);
    const [visible, remote] = ringSelectors;
    const [offVisible, offRemote] = offRule?.selectors ?? [];
    expect(specificity(offVisible)).toBeGreaterThanOrEqual(
      specificity(visible),
    );
    expect(specificity(offRemote)).toBeGreaterThanOrEqual(specificity(remote));
    expect(offRule!.at).toBeGreaterThan(
      Math.max(...ring.map((rule) => rule.at)),
    );
  });

  it("measures specificity as the cascade does", () => {
    expect(specificity(":where(a, button):focus-visible")).toBe(100);
    expect(specificity(":is(a, [tabindex]):focus-visible")).toBe(200);
    expect(specificity('[data-input="remote"] :where(a):not([x]):focus')).toBe(
      300,
    );
    expect(specificity('[tabindex="-1"]:focus-visible')).toBe(200);
  });
});
