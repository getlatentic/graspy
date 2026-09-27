import { describe, expect, it } from "vitest";
import { homeParts, type HomeState } from "./home-parts";

const home = (state: Partial<HomeState>): HomeState => ({
  voiceOnly: false,
  hasVoiceLessons: true,
  hasCurrent: false,
  subjectCount: 0,
  ...state,
});

describe("homeParts", () => {
  it("shows a class that learns by voice alone its voice lessons and nothing to read", () => {
    expect(homeParts(home({ voiceOnly: true }))).toEqual(["voice"]);
  });

  it("hides the subjects of such a class's plan, and the topic it was on", () => {
    const plan = { hasCurrent: true, subjectCount: 4 };
    expect(homeParts(home({ voiceOnly: true, ...plan }))).toEqual(["voice"]);
  });

  it("tells such a class when the app has no voice lessons for it yet", () => {
    const state = home({ voiceOnly: true, hasVoiceLessons: false });
    expect(homeParts(state)).toEqual(["noVoice"]);
  });

  it("shows any other class the topic to continue, voice lessons, subjects and ideas", () => {
    expect(homeParts(home({ hasCurrent: true, subjectCount: 4 }))).toEqual([
      "continue",
      "rail",
      "voice",
      "subjects",
      "try",
    ]);
  });

  it("leaves out a topic to continue and subjects a plan does not have", () => {
    expect(homeParts(home({}))).toEqual(["rail", "voice", "try"]);
  });
});
