import { describe, expect, it } from "vitest";
import { onboardingStrings, pageStrings } from "./strings.ts";

describe("onboardingStrings", () => {
  it("reads the language's own words and falls back to English for the rest", () => {
    const english = onboardingStrings("en");
    const pidgin = onboardingStrings("pcm");
    expect(english.next).toBe("Next");
    expect(pidgin.next).not.toBe("");
    expect(pidgin.readyContinue).toBe("Start");
  });
});

describe("pageStrings", () => {
  it("lists what the lesson page says when something went wrong or an answer is kept", () => {
    const words = pageStrings("en");
    expect(words.record).toBe("Record your answer");
    expect(words.problems).toContain("I couldn't hear you. Say it again.");
    expect(words.kept).toHaveLength(2);
  });
});
