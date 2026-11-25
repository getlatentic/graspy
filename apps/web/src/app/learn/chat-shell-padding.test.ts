import { describe, expect, it } from "vitest";

// Read from disk: the chat shell's classes are a string in a module.
async function viewportSource(): Promise<string> {
  const fsModule = "node:fs";
  const {
    readFileSync,
  }: { readFileSync: (path: URL, encoding: "utf8") => string } = await import(
    /* @vite-ignore */ fsModule
  );
  return readFileSync(
    new URL("../../features/learn/lib/chat-viewport.ts", import.meta.url),
    "utf8",
  );
}

describe("the learn shell", () => {
  it("keeps the notch's side padding on the chat shell, which is fixed and so ignores the body's", async () => {
    const source = await viewportSource();
    expect(source).toMatch(
      /"fixed inset-x-0[^"]*pr-\[env\(safe-area-inset-right\)\][^"]*pl-\[env\(safe-area-inset-left\)\]"/,
    );
  });
});
