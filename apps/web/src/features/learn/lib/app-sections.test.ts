import { describe, expect, it } from "vitest";
import { pageShown, sectionOf, sectionsFor } from "./app-sections";

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

describe("the sections a learner has", () => {
  it("are all four for a class that learns from slides", () => {
    expect(sectionsFor(false).map(({ id }) => id)).toEqual([
      "home",
      "subjects",
      "ask",
      "you",
    ]);
  });

  it("are Home and You for a class that learns by voice alone", () => {
    expect(sectionsFor(true).map(({ id }) => id)).toEqual(["home", "you"]);
  });
});

describe("pageShown", () => {
  it.each([
    "/app/learn/subjects",
    "/app/learn/plan",
    "/app/learn/mathematics",
    "/app/learn/mathematics/lesson/0",
    "/app/learn/ask",
    "/app/learn/ask/mathematics",
  ])("keeps %s from a class that learns by voice alone", (path) => {
    expect(pageShown(path, true)).toBe(false);
    expect(pageShown(path, false)).toBe(true);
  });

  it.each([
    "/app/learn",
    "/app/learn/voice",
    "/app/learn/voice/lesson",
    "/app/learn/you",
    "/app/learn/you/details",
    "/app/learn/you/learners",
  ])("shows %s to a class that learns by voice alone", (path) => {
    expect(pageShown(path, true)).toBe(true);
  });
});
