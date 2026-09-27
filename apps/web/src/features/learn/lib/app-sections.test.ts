import { describe, expect, it } from "vitest";
import {
  pageRedirect,
  pageShown,
  sectionOf,
  sectionsFor,
} from "./app-sections";

describe("pageRedirect", () => {
  it("leads a page a class that learns by voice alone does not have to Home, its voice lessons", () => {
    expect(pageRedirect("/app/learn/subjects", true)).toBe("/app/learn");
    expect(pageRedirect("/app/learn/mathematics/lesson/2", true)).toBe(
      "/app/learn",
    );
  });

  it("leads such a class's voice lessons page to Home, which is that page", () => {
    expect(pageRedirect("/app/learn/voice", true)).toBe("/app/learn");
    expect(pageRedirect("/app/learn/voice/", true)).toBe("/app/learn");
  });

  it("leaves the pages a learner has where they are", () => {
    expect(pageRedirect("/app/learn", true)).toBeNull();
    expect(pageRedirect("/app/learn/voice/lesson", true)).toBeNull();
    expect(pageRedirect("/app/learn/you", true)).toBeNull();
    expect(pageRedirect("/app/learn/subjects", false)).toBeNull();
  });

  it("keeps the voice lessons page for any other class", () => {
    expect(pageRedirect("/app/learn/voice", false)).toBeNull();
  });
});

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
