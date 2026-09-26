import { describe, expect, it } from "vitest";
import { sectionOf } from "./app-sections";

describe("sectionOf", () => {
  it.each([
    ["/app/learn", "home"],
    ["/app/learn/voice", "home"],
    ["/app/learn/voice/lesson", "home"],
    ["/app/learn/you", "you"],
    ["/app/learn/you/details", "you"],
    ["/app/learn/you/learners", "you"],
    ["/app/learn/ask/mathematics", "ask"],
    ["/app/learn/mathematics", "subjects"],
  ])("puts %s under %s", (path, section) => {
    expect(sectionOf(path)).toBe(section);
  });
});
