import { describe, expect, it } from "vitest";
import { MAX_CUE_MS, PATTERNS, RUMBLES, type Cue } from "./haptic-patterns";

const CUES = Object.keys(PATTERNS) as Cue[];
const total = (pattern: readonly number[]) =>
  pattern.reduce((sum, ms) => sum + ms, 0);
const longestPulse = (pattern: readonly number[]) =>
  Math.max(...pattern.filter((_, index) => index % 2 === 0));

describe("the cues", () => {
  it.each(CUES)("%s is short and whole", (cue) => {
    expect(total(PATTERNS[cue])).toBeLessThanOrEqual(MAX_CUE_MS);
    expect(PATTERNS[cue].length % 2).toBe(1);
    expect(PATTERNS[cue].every((ms) => Number.isInteger(ms) && ms > 0)).toBe(
      true,
    );
  });

  it("never makes a wrong answer harsher than a right one", () => {
    expect(longestPulse(PATTERNS.wrong)).toBeLessThanOrEqual(
      longestPulse(PATTERNS.correct),
    );
    expect(RUMBLES.wrong.weak).toBeLessThanOrEqual(RUMBLES.correct.weak);
    expect(RUMBLES.wrong.strong).toBeLessThanOrEqual(RUMBLES.correct.strong);
  });

  it.each(CUES)("%s rumbles a controller lightly", (cue) => {
    const { duration, weak, strong } = RUMBLES[cue];
    expect(duration).toBeLessThanOrEqual(MAX_CUE_MS);
    expect(Math.max(weak, strong)).toBeLessThanOrEqual(0.2);
  });
});
