import { describe, expect, it } from "vitest";

import type { GranularLessonPlan, GranularLessonRecord } from "./granularLesson";
import {
  addAssessment,
  addContentBlock,
  addCoreStep,
  addLessonObjective,
  addSourceVisualBlock,
  moveAssessment,
  moveContentBlock,
  moveCoreStep,
  moveLessonObjective,
  removeAssessment,
  removeContentBlock,
  removeCoreStep,
  removeLessonObjective,
  replaceAt,
  updateContentBlock,
  updateGranularPlan,
} from "./granularLessonEditing";

function structuralPlan(): GranularLessonPlan {
  const objectives = [
    {
      id: "objective-compare",
      statement: "Compare fractions.",
      sequence: 1,
      curriculumObjectiveId: "curriculum-fractions",
      atomicObjectiveId: "atomic-compare",
      knowledgeComponentId: "knowledge-compare",
    },
    {
      id: "objective-order",
      statement: "Order fractions.",
      sequence: 2,
      curriculumObjectiveId: "curriculum-fractions",
      atomicObjectiveId: "atomic-order",
      knowledgeComponentId: "knowledge-order",
    },
  ];
  const explanation = (id: string) => ({
    type: "explanation" as const,
    id,
    content: `${id} content`,
  });
  return {
    schemaVersion: 1,
    topic: "Fractions",
    subtopic: null,
    curriculumObjectives: [
      { id: "curriculum-fractions", statement: "Compare and order fractions.", sequence: 1 },
    ],
    atomicObjectives: [
      {
        id: "atomic-compare",
        curriculumObjectiveId: "curriculum-fractions",
        statement: "Compare fractions.",
        bloomVerb: "compare",
        bloomLevel: "understand",
        sequence: 1,
      },
      {
        id: "atomic-order",
        curriculumObjectiveId: "curriculum-fractions",
        statement: "Order fractions.",
        bloomVerb: "order",
        bloomLevel: "apply",
        sequence: 2,
      },
    ],
    lessonObjectives: objectives,
    knowledgeComponents: [
      {
        id: "knowledge-compare",
        description: "Compare fractions using a shared representation.",
        knowledgeType: "concept",
        bloomLevel: "understand",
        atomicObjectiveIds: ["atomic-compare"],
        prerequisiteKnowledgeComponentIds: [],
        supportingRecordIds: ["source-fractions"],
        sourceForm: null,
        targetForm: null,
        isPriorKnowledge: false,
      },
      {
        id: "knowledge-order",
        description: "Order fractions using a common denominator.",
        knowledgeType: "procedure",
        bloomLevel: "apply",
        atomicObjectiveIds: ["atomic-order"],
        prerequisiteKnowledgeComponentIds: [],
        supportingRecordIds: ["source-fractions"],
        sourceForm: null,
        targetForm: null,
        isPriorKnowledge: false,
      },
    ],
    misconceptions: [],
    priorKnowledge: [],
    materials: ["Fraction cards"],
    references: [
      { recordId: "source-fractions", title: "Fractions", attribution: "Source" },
    ],
    steps: [
      {
        id: "step-introduction",
        sequence: 1,
        role: "introduction",
        title: "Introduction",
        summary: "Recall fractions.",
        durationMinutes: 5,
        lessonObjectiveId: null,
        knowledgeType: null,
        teacherActivities: ["Ask a question."],
        learnerActivities: ["Answer the question."],
        blocks: [explanation("block-introduction")],
      },
      {
        id: "step-compare",
        sequence: 2,
        role: "core",
        title: "Compare",
        summary: "Compare fractions.",
        durationMinutes: 15,
        lessonObjectiveId: "objective-compare",
        knowledgeType: "concept",
        teacherActivities: ["Model comparison."],
        learnerActivities: ["Compare fractions."],
        blocks: [explanation("block-compare")],
      },
      {
        id: "step-order",
        sequence: 3,
        role: "core",
        title: "Order",
        summary: "Order fractions.",
        durationMinutes: 20,
        lessonObjectiveId: "objective-order",
        knowledgeType: "procedure",
        teacherActivities: ["Model ordering."],
        learnerActivities: ["Order fractions."],
        blocks: [explanation("block-order")],
      },
      {
        id: "step-evaluation",
        sequence: 4,
        role: "evaluation",
        title: "Check learning",
        summary: "Check both goals.",
        durationMinutes: 10,
        lessonObjectiveId: null,
        knowledgeType: null,
        teacherActivities: ["Share questions."],
        learnerActivities: ["Answer questions."],
        blocks: [
          {
            type: "practice",
            id: "evaluation-compare",
            lessonObjectiveId: "objective-compare",
            question: "Compare 1/2 and 2/3.",
            expectedAnswer: "1/2 < 2/3",
            hints: [],
          },
          {
            type: "practice",
            id: "evaluation-order",
            lessonObjectiveId: "objective-order",
            question: "Order 1/2, 2/3 and 3/4.",
            expectedAnswer: "1/2 < 2/3 < 3/4",
            hints: [],
          },
        ],
      },
    ],
    assessments: objectives.map((objective) => ({
      id: `assessment-${objective.id}`,
      lessonObjectiveId: objective.id,
      knowledgeComponentId: objective.knowledgeComponentId,
      question: `Question for ${objective.statement}`,
      expectedAnswer: "Expected answer.",
      bloomLevel: objective.id === "objective-order" ? "apply" : "understand",
      rubric: ["Correct response."],
      supportingRecordIds: ["source-fractions"],
    })),
  };
}

describe("granular lesson editing", () => {
  it("updates only the selected array item", () => {
    expect(replaceAt(["first", "second", "third"], 1, "updated")).toEqual([
      "first",
      "updated",
      "third",
    ]);
  });

  it("preserves immutable curriculum and evidence snapshots while editing the plan", () => {
    const record = {
      plan: { topic: "Fractions" },
      curriculumSnapshot: { packageId: "package-1" },
      sourceEvidenceSnapshot: { records: [] },
    } as unknown as GranularLessonRecord;

    const updated = updateGranularPlan(record, (plan) => ({
      ...plan,
      topic: "Equivalent fractions",
    }));

    expect(updated.plan.topic).toBe("Equivalent fractions");
    expect(updated.curriculumSnapshot).toBe(record.curriculumSnapshot);
    expect(updated.sourceEvidenceSnapshot).toBe(record.sourceEvidenceSnapshot);
  });

  it("does not allow a verified source visual to be edited as generated copy", () => {
    const visual = {
      type: "visual" as const,
      id: "visual-1",
      sourceRecordId: "source-1",
      assetFileName: "fraction.svg",
      figureSha256: "a".repeat(64),
      caption: "Fraction model",
      altText: "One half and two quarters",
    };

    expect(updateContentBlock(visual, "caption", "Changed")).toBe(visual);
  });

  it("moves a learning goal with its core steps and resequences the lesson", () => {
    const moved = moveLessonObjective(structuralPlan(), "objective-order", "up");

    expect(moved.lessonObjectives.map(({ id, sequence }) => [id, sequence])).toEqual([
      ["objective-order", 1],
      ["objective-compare", 2],
    ]);
    expect(moved.steps.map(({ id, sequence }) => [id, sequence])).toEqual([
      ["step-introduction", 1],
      ["step-order", 2],
      ["step-compare", 3],
      ["step-evaluation", 4],
    ]);
    expect(
      moved.steps.at(-1)!.blocks.map((block) =>
        block.type === "practice" ? block.lessonObjectiveId : null,
      ),
    ).toEqual(["objective-order", "objective-compare"]);
  });

  it("adds and removes a complete learning-goal bundle without dangling references", () => {
    const added = addLessonObjective(structuralPlan(), "objective-order");
    const addedObjective = added.lessonObjectives.at(-1)!;

    expect(addedObjective.id).toBe("lesson-objective-1");
    expect(added.steps.some(({ lessonObjectiveId }) => lessonObjectiveId === addedObjective.id)).toBe(true);
    expect(added.assessments.some(({ lessonObjectiveId }) => lessonObjectiveId === addedObjective.id)).toBe(true);
    expect(
      added.steps.at(-1)!.blocks.some(
        (block) => block.type === "practice" && block.lessonObjectiveId === addedObjective.id,
      ),
    ).toBe(true);

    const removed = removeLessonObjective(added, addedObjective.id);
    expect(removed.lessonObjectives).toEqual(structuralPlan().lessonObjectives);
    expect(JSON.stringify(removed)).not.toContain(addedObjective.id);
  });

  it("adds, moves, and removes an additional core step while preserving boundary steps", () => {
    const added = addCoreStep(structuralPlan(), "objective-order");
    const newStep = added.steps.at(-2)!;
    const moved = moveCoreStep(added, newStep.id, "up");

    expect(moved.steps[0].role).toBe("introduction");
    expect(moved.steps.at(-1)!.role).toBe("evaluation");
    expect(moved.steps.findIndex(({ id }) => id === newStep.id)).toBe(2);
    expect(removeCoreStep(moved, newStep.id).steps).toHaveLength(4);
    expect(() => removeCoreStep(structuralPlan(), "step-order")).toThrow(
      "Every learning goal needs at least one core lesson step.",
    );
  });

  it("adds, moves, and removes editable content blocks", () => {
    const added = addContentBlock(structuralPlan(), "step-order", "worked_example");
    const step = added.steps.find(({ id }) => id === "step-order")!;
    const newBlock = step.blocks.at(-1)!;
    const moved = moveContentBlock(added, "step-order", newBlock.id, "up");

    expect(moved.steps.find(({ id }) => id === "step-order")!.blocks[0].id).toBe(newBlock.id);
    expect(removeContentBlock(moved, "step-order", newBlock.id)).toEqual(structuralPlan());
  });

  it("adds a verified source image without making its content editable", () => {
    const added = addSourceVisualBlock(structuralPlan(), "step-order", {
      sourceRecordId: "source-fractions",
      assetFileName: "fraction-strip.svg",
      sha256: "a".repeat(64),
      caption: "Equivalent fraction strips",
      altText: "One half aligned with two quarters",
    });

    expect(added.steps[2].blocks.at(-1)).toEqual({
      type: "visual",
      id: "lesson-visual-1",
      sourceRecordId: "source-fractions",
      assetFileName: "fraction-strip.svg",
      figureSha256: "a".repeat(64),
      caption: "Equivalent fraction strips",
      altText: "One half aligned with two quarters",
    });
  });

  it("adds, moves, and removes assessment questions without orphaning a goal", () => {
    const added = addAssessment(structuralPlan(), "objective-order");
    const newAssessment = added.assessments.at(-1)!;
    const moved = moveAssessment(added, newAssessment.id, "up");

    expect(moved.assessments[1].id).toBe(newAssessment.id);
    expect(removeAssessment(moved, newAssessment.id)).toEqual(structuralPlan());
    expect(() => removeAssessment(structuralPlan(), "assessment-objective-order")).toThrow(
      "Every learning goal needs at least one check for understanding.",
    );
  });
});
