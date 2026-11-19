import { describe, expect, it } from "vitest";
import { chosenBand } from "./chosen-band";

const school = (descriptor: string) => ({
  names: { en: "x" },
  descriptor,
  voiceOnly: false,
});

describe("chosenBand", () => {
  it("is unknown until a class is chosen", () => {
    expect(chosenBand({ level: "", school: null })).toBeNull();
  });

  it.each([
    ["Primary 3, Nigeria, age 8", "child"],
    ["JSS 1 (Junior Secondary School), Nigeria, age 12", "tween"],
    ["SS 2 (Senior Secondary), Nigeria, age 16", "teen"],
  ])("puts %s in %s", (descriptor, band) => {
    expect(chosenBand({ level: "x", school: school(descriptor) })).toBe(band);
  });

  it("puts a learner after school in teen with no school descriptor", () => {
    expect(chosenBand({ level: "undergraduate", school: null })).toBe("teen");
  });
});
