// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { wantsButtonMode } from "./use-button-mode";

const media = (...matching: string[]) => ({
  matchMedia: (query: string) =>
    ({ matches: matching.includes(query) }) as MediaQueryList,
});

describe("wantsButtonMode", () => {
  it("is a button on a TV", () => {
    const root = document.createElement("html");
    root.dataset.device = "tv";
    expect(wantsButtonMode(root, media())).toBe(true);
  });

  it("is a button where the main pointer is a finger or nothing can hover", () => {
    const root = document.createElement("html");
    expect(wantsButtonMode(root, media("(pointer: coarse)"))).toBe(true);
    expect(wantsButtonMode(root, media("(hover: none)"))).toBe(true);
  });

  it("is a text field for a mouse and a keyboard, and where the browser cannot say", () => {
    const root = document.createElement("html");
    expect(
      wantsButtonMode(root, media("(pointer: fine)", "(hover: hover)")),
    ).toBe(false);
    expect(
      wantsButtonMode(root, {
        matchMedia: undefined as unknown as Window["matchMedia"],
      }),
    ).toBe(false);
  });
});
