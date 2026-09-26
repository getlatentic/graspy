import { describe, expect, it } from "vitest";
import { homeParts } from "./home-parts";

describe("homeParts", () => {
  it("shows a class that learns by voice alone its voice lessons and nothing to read", () => {
    expect(homeParts(true, false, 0)).toEqual(["voice"]);
  });

  it("hides the subjects of such a class's plan, and the topic it was on", () => {
    expect(homeParts(true, true, 4)).toEqual(["voice"]);
  });

  it("shows any other class the topic to continue, voice lessons, subjects and ideas", () => {
    expect(homeParts(false, true, 4)).toEqual([
      "continue",
      "rail",
      "voice",
      "subjects",
      "try",
    ]);
  });

  it("leaves out a topic to continue and subjects a plan does not have", () => {
    expect(homeParts(false, false, 0)).toEqual(["rail", "voice", "try"]);
  });
});
