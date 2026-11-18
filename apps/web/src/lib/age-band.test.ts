import { describe, expect, it } from "vitest";
import { ageBand } from "./age-band";

const school = (gradeLevel: string) => ({ level: "x", gradeLevel });

describe("ageBand", () => {
  it.each([
    ["Standard 3, Kenya, age 9", "child"],
    ["Standard 8 (Primary), Kenya, age 13", "tween"],
    ["JSS 1 (Junior Secondary School), Nigeria, age 12", "tween"],
    ["SS 2 (Senior Secondary), Nigeria, age 16", "teen"],
  ])("puts %s in %s", (gradeLevel, band) => {
    expect(ageBand(school(gradeLevel))).toBe(band);
  });

  it("puts a university learner in teen", () => {
    expect(ageBand({ level: "undergraduate", gradeLevel: "" })).toBe("teen");
  });

  it("falls back to child when the class names no age", () => {
    expect(ageBand(school("Class 5"))).toBe("child");
  });
});
