import { describe, expect, it } from "vitest";
import type { LearningSession } from "@/lib/curriculum-record";
import { setupSteps } from "@/features/learn/lib/setup-steps";

const lesson = (phase: LearningSession["phase"]) =>
  ({ phase }) as LearningSession;
const START = {
  isGenerating: true,
  subjectCount: 0,
  session: undefined,
  hasNextSubject: false,
};
const summary = (plan: Parameters<typeof setupSteps>[0]) =>
  setupSteps(plan).map(({ state, hint }) => [state, hint]);

describe("setupSteps", () => {
  it("starts with the subjects being made", () => {
    expect(summary(START)).toEqual([
      ["active", null],
      ["pending", null],
      ["pending", null],
    ]);
  });

  it("offers the first lesson once subjects arrive", () => {
    expect(
      summary({ ...START, subjectCount: 2, hasNextSubject: true }),
    ).toEqual([
      ["active", "subjectsReady"],
      ["active", "startLesson"],
      ["pending", null],
    ]);
  });

  it("follows the first lesson once it is prepared", () => {
    const ready = { ...START, isGenerating: false, subjectCount: 2 };
    expect(summary({ ...ready, session: lesson("explanation") })).toEqual([
      ["complete", "subjectsReady"],
      ["active", "lessonReady"],
      ["active", "lessonInProgress"],
    ]);
    expect(summary({ ...ready, session: lesson("complete") })).toEqual([
      ["complete", "subjectsReady"],
      ["complete", null],
      ["complete", null],
    ]);
  });

  it("finishes the path step when there is no subject to start", () => {
    const ready = { ...START, isGenerating: false, subjectCount: 1 };
    expect(summary(ready)[1]).toEqual(["complete", null]);
  });
});
