// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

// Read from disk: Vitest turns every CSS import into "". The module name is a variable so the
// browser tsconfig needs no node types; jsdom's import.meta.url is not a file URL, so the
// folder comes from import.meta.dirname.
async function pointerSelector(): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: string, encoding: "utf8") => string } =
    await import(/* @vite-ignore */ fsModule);
  const folder = (import.meta as unknown as { dirname: string }).dirname;
  const css = readFileSync(`${folder}/index.css`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
  const end = css.indexOf("{ cursor: pointer; }");
  const start = css.lastIndexOf("} :is(", end) + 2;
  return css.slice(start, end).trim();
}

afterEach(() => {
  document.body.innerHTML = "";
});

const first = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
};

describe("the pointer rule's selector", () => {
  it.each([
    "<button>Go</button>",
    '<a href="/x">x</a>',
    '<div role="option">x</div>',
    '<div role="tab">x</div>',
    '<label><input type="checkbox"> x</label>',
    '<input type="checkbox">',
    '<input role="combobox" readonly>',
    "<summary>x</summary>",
    "<select></select>",
  ])("matches %s, so it gets the hand", async (html) => {
    expect(first(html).matches(await pointerSelector())).toBe(true);
  });

  it.each([
    "<button disabled>Go</button>",
    '<button aria-disabled="true">Go</button>',
    '<a href="/x" aria-disabled="true">x</a>',
    '<div role="option" aria-disabled="true">x</div>',
    '<div role="button" aria-disabled="true">x</div>',
    '<input type="checkbox" disabled>',
    '<input role="combobox" disabled>',
    "<select disabled></select>",
  ])(
    "does not match %s, so a disabled control keeps its own cursor",
    async (html) => {
      expect(first(html).matches(await pointerSelector())).toBe(false);
    },
  );

  it("does not match a select's field once it is a text field (Search), which keeps the text cursor", async () => {
    expect(
      first('<input role="combobox">').matches(await pointerSelector()),
    ).toBe(false);
  });

  it("does not match the label of a disabled checkbox", async () => {
    const label = first('<label><input type="checkbox" disabled> x</label>');
    expect(label.matches(await pointerSelector())).toBe(false);
  });
});
