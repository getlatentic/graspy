import { describe, expect, it } from "vitest";

import {
  addCheck,
  addObjective,
  addStep,
  addStepBlock,
  emptyLessonContent,
  addInstructionalMaterial,
  moveCheck,
  moveInstructionalMaterial,
  moveObjective,
  moveStep,
  moveStepBlock,
  removeCheck,
  removeInstructionalMaterial,
  removeObjective,
  removeStep,
  removeStepBlock,
  setStepBlock,
  updateCheck,
  updateInstructionalMaterial,
  updateObjective,
  updateStep,
} from "./lessonContentEditing";

describe("lessonContentEditing", () => {
  it("builds a lesson up from nothing with unique ids across steps", () => {
    let content = emptyLessonContent();
    content = addStep(content);
    content = addStep(content);
    content = addStepBlock(content, "step-1", "explanation");
    content = addStepBlock(content, "step-1", "worked_example");
    content = addStepBlock(content, "step-2", "practice");

    expect(content.steps.map(({ id }) => id)).toEqual(["step-1", "step-2"]);
    expect(content.steps[0].blocks.map(({ id, type }) => [id, type])).toEqual([
      ["block-1", "explanation"],
      ["block-2", "worked_example"],
    ]);
    // The third block sits in another step but still takes the next free id.
    expect(content.steps[1].blocks).toEqual([
      { id: "block-3", type: "practice", question: "", expectedAnswer: "", hints: [] },
    ]);
  });

  it("edits goals, step fields, blocks and checks by reference", () => {
    let content = addObjective(addObjective(emptyLessonContent()));
    content = updateObjective(content, 0, "Count in millions.");
    content = addStep(content);
    content = updateStep(content, "step-1", { title: "Count forward", durationMinutes: 15 });
    content = addStepBlock(content, "step-1", "explanation");
    content = setStepBlock(content, "step-1", {
      type: "explanation",
      id: "block-1",
      content: "A million is a thousand thousands.",
    });
    content = addCheck(content);
    content = updateCheck(content, "check-1", { question: "Write four million.", expectedAnswer: "4,000,000" });

    expect(content.objectives).toEqual(["Count in millions.", ""]);
    expect(content.steps[0]).toMatchObject({ title: "Count forward", durationMinutes: 15 });
    expect(content.steps[0].blocks[0]).toEqual({
      type: "explanation",
      id: "block-1",
      content: "A million is a thousand thousands.",
    });
    expect(content.checks[0]).toEqual({
      id: "check-1",
      question: "Write four million.",
      expectedAnswer: "4,000,000",
    });
  });

  it("reorders steps and the blocks within a step", () => {
    let content = addStep(addStep(emptyLessonContent()));
    content = addStepBlock(content, "step-1", "explanation");
    content = addStepBlock(content, "step-1", "practice");

    const reordered = moveStep(content, "step-2", "up");
    expect(reordered.steps.map(({ id }) => id)).toEqual(["step-2", "step-1"]);

    const movedBlock = moveStepBlock(content, "step-1", "block-2", "up");
    expect(movedBlock.steps[0].blocks.map(({ id }) => id)).toEqual(["block-2", "block-1"]);
  });

  it("reuses a freed id rather than growing forever, and refuses a move past a boundary", () => {
    let content = addStep(addStep(emptyLessonContent()));
    content = removeStep(content, "step-1");
    content = addStep(content);
    expect(content.steps.map(({ id }) => id)).toEqual(["step-2", "step-1"]);

    expect(() => moveObjective(addObjective(emptyLessonContent()), 0, "up")).toThrow(/boundary/);
  });

  it("removes a step and a single block without disturbing the rest", () => {
    let content = addStep(addStep(emptyLessonContent()));
    content = addStepBlock(content, "step-2", "explanation");
    content = addStepBlock(content, "step-2", "practice");

    const withoutStep = removeStep(content, "step-1");
    expect(withoutStep.steps.map(({ id }) => id)).toEqual(["step-2"]);

    const withoutBlock = removeStepBlock(content, "step-2", "block-1");
    expect(withoutBlock.steps[1].blocks.map(({ id }) => id)).toEqual(["block-2"]);
  });

  /// The lists a teacher edits by position rather than by id. Every one of
  /// these was reachable from the editor and proved by nothing: an off-by-one
  /// in removeAt or moveAt silently rewrites the wrong line of a lesson.
  describe("the goals and instructionalMaterials a teacher keeps in order", () => {
    const threeGoals = () => {
      let content = emptyLessonContent();
      for (const [index, text] of ["first", "second", "third"].entries()) {
        content = updateObjective(addObjective(content), index, text);
      }
      return content;
    };

    const threeInstructionalMaterials = () => {
      let content = emptyLessonContent();
      for (const [index, text] of ["chalk", "ruler", "cards"].entries()) {
        content = updateInstructionalMaterial(addInstructionalMaterial(content), index, text);
      }
      return content;
    };

    it("removes the goal at the position given and leaves its neighbours in order", () => {
      expect(removeObjective(threeGoals(), 1).objectives).toEqual(["first", "third"]);
    });

    it("removes the first and last goal without disturbing the rest", () => {
      expect(removeObjective(threeGoals(), 0).objectives).toEqual(["second", "third"]);
      expect(removeObjective(threeGoals(), 2).objectives).toEqual(["first", "second"]);
    });

    it("moves a goal up by swapping it with the one above", () => {
      expect(moveObjective(threeGoals(), 1, "up").objectives).toEqual([
        "second",
        "first",
        "third",
      ]);
    });

    it("moves a goal down by swapping it with the one below", () => {
      expect(moveObjective(threeGoals(), 1, "down").objectives).toEqual([
        "first",
        "third",
        "second",
      ]);
    });

    it("refuses to move a goal off either end rather than dropping it", () => {
      expect(() => moveObjective(threeGoals(), 0, "up")).toThrow(/boundary/u);
      expect(() => moveObjective(threeGoals(), 2, "down")).toThrow(/boundary/u);
    });

    it("removes and reorders instructionalMaterials the same way", () => {
      expect(removeInstructionalMaterial(threeInstructionalMaterials(), 0).instructionalMaterials).toEqual(["ruler", "cards"]);
      expect(moveInstructionalMaterial(threeInstructionalMaterials(), 2, "up").instructionalMaterials).toEqual([
        "chalk",
        "cards",
        "ruler",
      ]);
      expect(() => moveInstructionalMaterial(threeInstructionalMaterials(), 2, "down")).toThrow(/boundary/u);
    });

    it("leaves the lesson it was given untouched", () => {
      const before = threeGoals();
      removeObjective(before, 0);
      moveObjective(before, 0, "down");
      expect(before.objectives).toEqual(["first", "second", "third"]);
    });
  });

  describe("the checks a teacher keeps in order", () => {
    const twoChecks = () => {
      let content = addCheck(addCheck(emptyLessonContent()));
      const [first, second] = content.checks;
      if (!first || !second) throw new Error("two checks");
      content = updateCheck(content, first.id, { question: "first" });
      return updateCheck(content, second.id, { question: "second" });
    };

    it("removes the check named, not the one beside it", () => {
      const content = twoChecks();
      const first = content.checks[0];
      if (!first) throw new Error("a check");
      expect(removeCheck(content, first.id).checks.map(({ question }) => question)).toEqual([
        "second",
      ]);
    });

    it("moves the check named, found by id rather than by position", () => {
      const content = twoChecks();
      const second = content.checks[1];
      if (!second) throw new Error("a second check");
      expect(moveCheck(content, second.id, "up").checks.map(({ question }) => question)).toEqual([
        "second",
        "first",
      ]);
    });

    it("refuses to move a check off the end", () => {
      const content = twoChecks();
      const first = content.checks[0];
      if (!first) throw new Error("a check");
      expect(() => moveCheck(content, first.id, "up")).toThrow(/boundary/u);
    });
  });
});
