import { describe, expect, it } from "vitest";
import { lengthOf, whenOf } from "./recording-format";

describe("a recording's length", () => {
  it.each([
    [0, "0:00"],
    [7, "0:07"],
    [59.6, "1:00"],
    [65, "1:05"],
    [600, "10:00"],
    [-3, "0:00"],
  ])("%d seconds is %s", (seconds, shown) => {
    expect(lengthOf(seconds)).toBe(shown);
  });
});

describe("when a recording was made", () => {
  const AT = Date.UTC(2026, 8, 29, 9, 5);

  it("is written in the interface's language", () => {
    expect(whenOf(AT, "en")).toContain("2026");
    expect(whenOf(AT, "ar")).not.toBe(whenOf(AT, "en"));
  });

  it("is still shown for a locale the browser does not know", () => {
    expect(whenOf(AT, "not a locale")).toBe("2026-09-29T09:05:00.000Z");
  });
});
