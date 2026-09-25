import { describe, expect, it } from "vitest";
import { withoutRepeatedTitle } from "./slide-body";

describe("withoutRepeatedTitle", () => {
  it.each([
    [
      "### What are Number Systems?\n\nA number system is",
      "A number system is",
    ],
    ["**What are Number Systems?**\nA number system is", "A number system is"],
    ["What are number systems\n\nA number system is", "A number system is"],
  ])("drops a first line that repeats the title: %j", (body, expected) => {
    expect(withoutRepeatedTitle(body, "What are Number Systems?")).toBe(
      expected,
    );
  });

  it("keeps a first line that only starts like the title", () => {
    const body = "What are Number Systems used for?\n\nCounting.";
    expect(withoutRepeatedTitle(body, "What are Number Systems?")).toBe(body);
  });

  it("keeps a body that is only the title", () => {
    expect(withoutRepeatedTitle("", "Title")).toBe("");
  });
});
