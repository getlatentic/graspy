import { describe, expect, it } from "vitest";
import { LearnerChanged, pinTo } from "./learner-pin";

describe("work pinned to a learner", () => {
  it("holds while the device learns as them, and stops once it learns as someone else", () => {
    let learner = "uid-1/ada";
    const pin = pinTo(() => learner);

    expect(pin.learner).toBe("uid-1/ada");
    expect(pin.holds()).toBe(true);
    expect(() => pin.hold()).not.toThrow();

    learner = "uid-1/grace";

    expect(pin.holds()).toBe(false);
    expect(() => pin.hold()).toThrow(LearnerChanged);
  });

  it("stays stopped when the device comes back to them: the device was wiped between", () => {
    let learner = "uid-1/ada";
    const pin = pinTo(() => learner);
    learner = "uid-1/grace";
    const later = pinTo(() => learner);
    learner = "uid-1/ada";

    expect(later.holds()).toBe(false);
    expect(pin.holds()).toBe(true);
  });
});
