import { describe, expect, it } from "vitest";

// Read from disk: Vitest cannot import an image. The module name is a variable so the browser
// tsconfig needs no node types.
async function lockup(): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: URL, encoding: "utf8") => string } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(
    new URL("../../../public/brand/graspy-lockup-v1.svg", import.meta.url),
    "utf8",
  );
}

describe("the logo lockup file", () => {
  it("is cropped to its ink, at the ratio Logo reserves, and names itself graspy", async () => {
    const svg = await lockup();
    expect(svg).toContain('viewBox="0 -563 4552 836"');
    expect(svg).toContain('aria-label="graspy"');
  });
});
