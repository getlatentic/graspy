import { describe, expect, it } from "vitest";

import { lessonStages } from "./lessonProgress";

const names = (input: Parameters<typeof lessonStages>[0]) =>
  lessonStages(input).map(({ name, state }) => `${name}:${state}`);

describe("where a lesson has got to", () => {
  it("puts a teacher on writing when there is no plan", () => {
    expect(names({ status: "draft", hasPlan: false, classworkWritten: false })).toEqual([
      "Write the plan:now",
      "Confirm the plan:next",
      "Create the classwork:next",
    ]);
  });

  it("puts a teacher on confirming once a plan exists", () => {
    expect(names({ status: "draft", hasPlan: true, classworkWritten: false })).toEqual([
      "Write the plan:done",
      "Confirm the plan:now",
      "Create the classwork:next",
    ]);
  });

  it("puts a teacher on the classwork once the plan is confirmed", () => {
    expect(names({ status: "confirmed", hasPlan: true, classworkWritten: false })).toEqual([
      "Write the plan:done",
      "Confirm the plan:done",
      "Create the classwork:now",
    ]);
  });

  /// The strip used to leave the last step forever undone, because the lesson
  /// carried nothing about its classwork — a finished lesson looked exactly
  /// like one that had never started.
  it("reports the classwork done once it is written", () => {
    const stages = lessonStages({ status: "confirmed", hasPlan: true, classworkWritten: true });
    expect(stages.map(({ state }) => state)).toEqual(["done", "done", "done"]);
  });

  /// Exactly one step is ever the one to do, and it is never behind the teacher.
  it("puts a teacher on one step at a time, until there are none left", () => {
    for (const status of ["draft", "confirmed"] as const) {
      for (const hasPlan of [true, false]) {
        const stages = lessonStages({ status, hasPlan, classworkWritten: false });
        expect(stages[2].state).not.toBe("done");
        expect(stages.filter(({ state }) => state === "now")).toHaveLength(1);
      }
    }
  });
});
