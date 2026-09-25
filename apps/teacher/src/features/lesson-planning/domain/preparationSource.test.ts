import { describe, expect, it } from "vitest";

import { preparationSource } from "./preparationSource";

const nothing = { scheduled: false, hasLearningGoals: false, fromPastedPlan: false };

describe("preparationSource", () => {
  it("has nothing to build from when the lesson has no week, no goals and no pasted plan", () => {
    expect(preparationSource(nothing)).toBeNull();
  });

  it("builds from the teaching week when the lesson sits on one", () => {
    expect(preparationSource({ ...nothing, scheduled: true })).toBe("scheduled");
  });

  it("builds from the lesson's own goals when it sits on no week", () => {
    expect(preparationSource({ ...nothing, hasLearningGoals: true })).toBe("ownGoals");
  });

  it("prefers a pasted plan over the week it would otherwise use", () => {
    expect(preparationSource({ scheduled: true, hasLearningGoals: true, fromPastedPlan: true })).toBe(
      "pastedPlan",
    );
  });

  it("prefers the week over goals of its own", () => {
    expect(preparationSource({ ...nothing, scheduled: true, hasLearningGoals: true })).toBe(
      "scheduled",
    );
  });
});
