import { describe, expect, it } from "vitest";

import type { GranularLessonPlan } from "./granularLesson";
import { lessonContentFromGranularPlan } from "./lessonContentFromGranular";

/** A generated plan carrying every block kind, including a figure. */
function generatedPlan(): GranularLessonPlan {
  return {
    schemaVersion: 1,
    topic: "Whole numbers",
    subtopic: "Millions",
    curriculumObjectives: [{ id: "curriculum-1", statement: "Count in millions.", sequence: 1 }],
    atomicObjectives: [
      {
        id: "atomic-1",
        curriculumObjectiveId: "curriculum-1",
        statement: "Count in millions.",
        bloomVerb: "count",
        bloomLevel: "apply",
        sequence: 1,
      },
    ],
    lessonObjectives: [
      {
        id: "objective-1",
        statement: "Count in millions.",
        sequence: 1,
        curriculumObjectiveId: "curriculum-1",
        atomicObjectiveId: "atomic-1",
        knowledgeComponentId: "knowledge-1",
      },
    ],
    knowledgeComponents: [
      {
        id: "knowledge-1",
        description: "Count forward in millions.",
        knowledgeType: "procedure",
        bloomLevel: "apply",
        atomicObjectiveIds: ["atomic-1"],
        prerequisiteKnowledgeComponentIds: [],
        supportingRecordIds: ["source-1"],
        sourceForm: null,
        targetForm: null,
        isPriorKnowledge: false,
      },
    ],
    misconceptions: [],
    priorKnowledge: [],
    materials: ["Place-value chart"],
    references: [{ recordId: "source-1", title: "Whole numbers", attribution: "Source" }],
    steps: [
      {
        id: "step-1",
        sequence: 1,
        role: "core",
        title: "Count forward",
        summary: "Count in millions on the chart.",
        durationMinutes: 15,
        lessonObjectiveId: "objective-1",
        knowledgeType: "procedure",
        teacherActivities: ["Model counting."],
        learnerActivities: ["Count along."],
        blocks: [
          { type: "explanation", id: "block-explain", content: "A million is a thousand thousands." },
          {
            type: "worked_example",
            id: "block-worked",
            problem: "Count from 1,000,000 to 5,000,000.",
            steps: [{ label: "Start", content: "Begin at 1,000,000." }],
            finalAnswer: "1,000,000 · 2,000,000 · 3,000,000 · 4,000,000 · 5,000,000",
          },
          {
            type: "practice",
            id: "block-practice",
            lessonObjectiveId: "objective-1",
            question: "Count from 3,000,000 to 6,000,000.",
            expectedAnswer: "3,000,000 · 4,000,000 · 5,000,000 · 6,000,000",
            hints: ["Add one million each time."],
          },
          {
            type: "visual",
            id: "block-visual",
            sourceRecordId: "source-1",
            assetFileName: "chart.png",
            figureSha256: "a".repeat(64),
            caption: "A place-value chart.",
            altText: "Chart of place values.",
          },
        ],
      },
    ],
    assessments: [
      {
        id: "assessment-1",
        lessonObjectiveId: "objective-1",
        knowledgeComponentId: "knowledge-1",
        question: "Write four million in digits.",
        expectedAnswer: "4,000,000",
        bloomLevel: "apply",
        rubric: ["Digits grouped in threes."],
        supportingRecordIds: ["source-1"],
      },
    ],
  };
}

describe("lessonContentFromGranularPlan", () => {
  it("reads objectives as their statements and assessments as checks", () => {
    const content = lessonContentFromGranularPlan(generatedPlan());

    expect(content.objectives).toEqual(["Count in millions."]);
    expect(content.instructionalMaterials).toEqual(["Place-value chart"]);
    expect(content.checks).toEqual([
      {
        id: "assessment-1",
        question: "Write four million in digits.",
        expectedAnswer: "4,000,000",
      },
    ]);
  });

  it("keeps the teacher-facing blocks and drops the figure, which is not lesson content", () => {
    const content = lessonContentFromGranularPlan(generatedPlan());

    const kinds = content.steps[0].blocks.map((block) => block.type);
    expect(kinds).toEqual(["explanation", "worked_example", "practice"]);
  });
});
