import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./haptic-settings";

describe("the haptic settings", () => {
  it("are on until the learner turns them off", () => {
    expect(parseSettings(null)).toEqual({ enabled: true });
    expect(parseSettings('{"enabled":false}')).toEqual({ enabled: false });
  });

  it("fall back to the default for anything that is not a setting", () => {
    for (const raw of ["", "nope", "[]", "{}", '{"enabled":"no"}', "3"]) {
      expect(parseSettings(raw)).toBe(DEFAULT_SETTINGS);
    }
  });
});
