import { describe, expect, it } from "vitest";
import { subjectArt } from "./subject-art";

describe("subjectArt", () => {
  it.each([
    ["Mathematics", "math"],
    ["Integrated Science", "science"],
    ["English Language", "english"],
    ["ICT", "ict"],
    ["Computer Science", "ict"],
  ])("gives %s the %s picture", (name, art) => {
    expect(subjectArt(name)).toBe(art);
  });

  it("does not take ict from inside another word", () => {
    expect(subjectArt("Dictation")).toBeNull();
  });

  it("gives a subject with no picture none", () => {
    expect(subjectArt("Music")).toBeNull();
  });
});
