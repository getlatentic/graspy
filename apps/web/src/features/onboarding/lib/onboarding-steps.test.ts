import { describe, expect, it } from "vitest";
import type { DetailsSchema } from "../schemas/onboarding-schema";
import { nextLabelKey, stepsFor } from "./onboarding-steps";

// As chosen from the catalogue, which says whether the class learns by voice alone.
const inClass = (level: string, voiceOnly = false): DetailsSchema => ({
  country: "NG",
  language: "en",
  system: "NG",
  level,
  school: { names: { en: level }, descriptor: `${level}, Nigeria`, voiceOnly },
  course: "",
});

describe("stepsFor", () => {
  it("has a class the catalogue says learns by voice alone give its details and nothing more", () => {
    expect(stepsFor(inClass("nursery-2", true))).toEqual(["profile"]);
  });

  it("goes by the catalogue's word, never by the class's name", () => {
    expect(stepsFor(inClass("nursery-2", false))).toEqual([
      "profile",
      "subjects",
    ]);
  });

  it("has any other class choose its subjects after its details", () => {
    expect(stepsFor(inClass("primary-1"))).toEqual(["profile", "subjects"]);
    expect(stepsFor(inClass(""))).toEqual(["profile", "subjects"]);
  });
});

describe("nextLabelKey", () => {
  it("goes on to the next step, or starts on the last", () => {
    expect(nextLabelKey(false, false, false)).toBe("onboarding.next");
    expect(nextLabelKey(false, true, false)).toBe("onboarding.start");
  });

  it("says the plan is being set up while it is", () => {
    expect(nextLabelKey(true, true, false)).toBe("onboarding.settingUp");
  });

  it("tries again once the plan was not kept", () => {
    expect(nextLabelKey(false, true, true)).toBe(
      "onboarding.generating.tryAgain",
    );
  });
});
