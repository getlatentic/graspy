import { describe, expect, it } from "vitest";
import type { DetailsSchema } from "../schemas/onboarding-schema";
import { nextLabelKey, stepsFor } from "./onboarding-steps";

const inClass = (level: string): DetailsSchema => ({
  country: "NG",
  language: "en",
  system: "NG",
  level,
  school: { names: { en: level }, descriptor: `${level}, Nigeria` },
  course: "",
});

describe("stepsFor", () => {
  it("has a class that learns by voice alone give its details and nothing more", () => {
    expect(stepsFor(inClass("nursery-2"))).toEqual(["profile"]);
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
