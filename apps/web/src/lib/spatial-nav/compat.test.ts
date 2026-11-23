import { describe, expect, it } from "vitest";

// Read from disk, so the guard needs no DOM.
async function sources(): Promise<{ file: string; text: string }[]> {
  const fsModule = "node:fs";
  const fs: {
    readdirSync: (p: URL) => string[];
    readFileSync: (p: URL, e: "utf8") => string;
  } = await import(/* @vite-ignore */ fsModule);
  const dirs = ["./", "../focus-memory/"];
  const files = dirs.flatMap((dir) =>
    fs
      .readdirSync(new URL(dir, import.meta.url))
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
      .map((f) => dir + f),
  );
  files.push("../back-stack.ts", "../remote-keys.ts", "../remote-input.ts");
  return files.map((file) => ({
    file,
    text: fs.readFileSync(new URL(file, import.meta.url), "utf8"),
  }));
}

describe("what the arrow path may use", () => {
  it("leaves out Array.prototype.at, findLast and Object.hasOwn, which a TV's Chromium 85 or Safari 14 lacks", async () => {
    for (const { file, text } of await sources()) {
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/\.at\(|\.findLast\(|Object\.hasOwn\(/);
    }
  });
});
