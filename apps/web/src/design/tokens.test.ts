import { describe, expect, it } from "vitest";

const REGENERATE =
  "tokens.css is stale: run `node content/design/build.mjs` from the repository root.";

type ReadFile = (path: URL, encoding: "utf8") => string;

// Vitest turns every CSS import into "", even with ?raw, so the file is read from disk. The module
// name is a variable so the browser tsconfig needs no node types.
async function read(relativePath: string): Promise<string> {
  const fsModule = "node:fs";
  const { readFileSync }: { readFileSync: ReadFile } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

async function sha256(...parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = parts.map((part) => encoder.encode(part));
  const joined = new Uint8Array(
    bytes.reduce((size, part) => size + part.length, 0),
  );
  bytes.reduce(
    (offset, part) => (joined.set(part, offset), offset + part.length),
    0,
  );
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readStamp(text: string) {
  const match = /graspy-tokens source=(\w+) content=(\w+)[^\n]*\n/.exec(text);
  if (!match) throw new Error(REGENERATE);
  return {
    source: match[1],
    content: match[2],
    body: text.slice(match.index + match[0].length),
  };
}

describe("tokens.css", () => {
  it("was generated from the current tokens.json", async () => {
    const [css, tokens, generator] = await Promise.all([
      read("./tokens.css"),
      read("../../../../content/design/tokens.json"),
      read("../../../../content/design/build.mjs"),
    ]);
    expect(readStamp(css).source, REGENERATE).toBe(
      await sha256(tokens, generator),
    );
  });

  it("has not been edited by hand", async () => {
    const { content, body } = readStamp(await read("./tokens.css"));
    expect(content, REGENERATE).toBe(await sha256(body));
  });
});
