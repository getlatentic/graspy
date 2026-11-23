import { describe, expect, it } from "vitest";

// Read from disk: the shell's classes are a string in a component.
async function layoutSource(): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: URL, encoding: "utf8") => string } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
}

describe("the learn shell", () => {
  it("keeps the notch's side padding on the chat shell, which is fixed and so ignores the body's", async () => {
    const source = await layoutSource();
    expect(source).toMatch(
      /"fixed inset-x-0[^"]*pr-\[env\(safe-area-inset-right\)\][^"]*pl-\[env\(safe-area-inset-left\)\]"/,
    );
  });
});
