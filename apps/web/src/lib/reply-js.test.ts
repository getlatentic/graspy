import { describe, expect, it } from "vitest";
import corpus from "../../../../tests/fixtures/math-repair.json";

// The Android app draws a tutor reply with apps/mobile/.../app-host/reply.js, marked and KaTeX in a
// WebView. It is run here the way the page runs it, in jsdom, on what the server sends: the corpus's
// "web" text. The Gradle project's tests do not run under npm.

interface Window {
  eval(code: string): void;
  document: Document;
  graspyReply: { postMessage(message: string): void; onmessage?: (event: { data: string }) => void };
  ResizeObserver: unknown;
}
type ReadFile = (path: URL, encoding: "utf8") => string;
type NewDom = new (html: string, options: { runScripts: string }) => { window: Window };

async function draw(): Promise<(text: string) => string> {
  const fsModule = "node:fs";
  const domModule = "jsdom";
  const { readFileSync }: { readFileSync: ReadFile } = await import(
    /* @vite-ignore */ fsModule
  );
  const { JSDOM }: { JSDOM: NewDom } = await import(/* @vite-ignore */ domModule);
  const asset = (name: string) =>
    readFileSync(
      new URL(`../../../mobile/app/src/main/assets/app-host/${name}`, import.meta.url),
      "utf8",
    );
  const { window } = new JSDOM("<!doctype html><div id='reply'></div>", {
    runScripts: "outside-only",
  });
  window.eval(asset("vendor/katex.min.js"));
  window.eval(asset("vendor/marked.umd.js"));
  window.ResizeObserver = class {
    observe() {}
  };
  window.graspyReply = { postMessage: () => {} };
  window.eval(asset("reply.js"));
  return (text) => {
    window.graspyReply.onmessage?.({ data: JSON.stringify({ text }) });
    return window.document.getElementById("reply")!.innerHTML;
  };
}

const webText = (name: string) => corpus.cases.find((c) => c.name === name)!.web;
const sources = (page: string) =>
  [...page.matchAll(/<annotation[^>]*>([\s\S]*?)<\/annotation>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
const katexCount = (page: string) => (page.match(/class="katex"/g) ?? []).length;

describe("the Android reply page", async () => {
  const android = await draw();

  it("keeps the line break of a matrix: the exact production string", () => {
    const text = webText(
      "a line break length mangled by an earlier web is restored",
    );
    expect(text).toBe(
      "$R(\\theta)=\\begin{pmatrix} \\cos\\theta & -\\sin\\theta\\\\[4pt] \\sin\\theta & \\ \\cos\\theta \\end{pmatrix}$.",
    );
    const page = android(text);
    expect(katexCount(page)).toBe(1);
    expect(page).not.toContain("<br");
    expect(page).not.toContain("katex-error");
    expect(sources(page)[0]).toContain("\\\\[4pt]");
  });

  it("does not turn \\\\[ into the opening of display maths", () => {
    const page = android("$\\begin{pmatrix} a \\\\[2pt] b \\end{pmatrix}$ and \\[x^2\\]");
    expect(katexCount(page)).toBe(2);
    expect(page).not.toContain("katex-error");
    expect(sources(page)).toEqual([
      "\\begin{pmatrix} a \\\\[2pt] b \\end{pmatrix}",
      "x^2",
    ]);
  });

  it("shows the sign of an amount inside the formula that follows it", () => {
    const page = android(webText("an amount before a formula goes into it"));
    expect(katexCount(page)).toBe(1);
    expect(page).not.toContain("<br");
    expect(page).not.toContain("katex-error");
    expect(sources(page)[0]).toBe('\\char"24{}5 \\times 3');
  });

  it("shows an escaped dollar sign as a dollar sign", () => {
    const page = android("Tom has \\$5 and buys $\\frac12 + 1$ kg");
    expect(katexCount(page)).toBe(1);
    expect(page).toContain("Tom has $5 and buys");
  });

  it("draws a table, bold text and a link with maths in them", () => {
    const table = android(webText("a table row with a formula is repaired cell by cell"));
    expect(table).toContain("<table>");
    expect(katexCount(table)).toBe(1);
    expect(table).not.toContain("katex-error");

    const bold = android(webText("bold before a formula"));
    expect(bold).toContain("<strong>x</strong>");
    expect(katexCount(bold)).toBe(1);

    const link = android(webText("a link before a formula"));
    expect(link).toContain('<a href="http://a.b">link</a>');
    expect(katexCount(link)).toBe(1);
  });
});
