import { describe, expect, it } from "vitest";

import { taughtChecks, taughtStepFromActivities, taughtSteps } from "./lessonTaught";
import type { LessonContent } from "./lessonContent";

const CONTENT: LessonContent = {
  objectives: ["Read whole numbers up to one billion."],
  instructionalMaterials: ["Place-value chart"],
  steps: [
    {
      id: "step-1",
      title: "Name the groups",
      durationMinutes: 10,
      summary: "Group digits in threes and name each group.",
      blocks: [
        {
          type: "explanation",
          id: "block-1",
          content: "From the right the groups are ones, thousands, millions, then billions.",
        },
        { type: "explanation", id: "block-2", content: "   " },
        {
          type: "worked_example",
          id: "block-3",
          problem: "Read 1 234 567 890.",
          steps: [
            { label: "Group", content: "1 | 234 | 567 | 890" },
            { label: "", content: "Name each group from the left." },
          ],
          finalAnswer: "One billion, two hundred and thirty-four million…",
        },
        {
          type: "practice",
          id: "block-4",
          question: "Write 45 000 000 in words.",
          expectedAnswer: "Forty-five million",
          hints: ["Group the digits first."],
        },
      ],
    },
  ],
  checks: [
    { id: "check-1", question: "Which group sits furthest left in 1 234 567 890?", expectedAnswer: "Billions" },
    { id: "check-2", question: "", expectedAnswer: "" },
  ],
};

describe("taughtSteps", () => {
  it("carries the plan's own words: explanations, worked examples with answers, practice", () => {
    const [step] = taughtSteps(CONTENT);

    expect(step.title).toBe("Name the groups");
    expect(step.taught).toEqual([
      "From the right the groups are ones, thousands, millions, then billions.",
    ]);
    expect(step.workedExamples).toEqual([
      "Read 1 234 567 890.\nGroup: 1 | 234 | 567 | 890\nName each group from the left.\nAnswer: One billion, two hundred and thirty-four million…",
    ]);
    expect(step.practice).toEqual(["Write 45 000 000 in words.\nAnswer: Forty-five million"]);
  });
});

describe("taughtChecks", () => {
  it("keeps only the checks that ask something, with their expected answers", () => {
    expect(taughtChecks(CONTENT)).toEqual([
      { question: "Which group sits furthest left in 1 234 567 890?", expectedAnswer: "Billions" },
    ]);
  });
});

describe("taughtStepFromActivities", () => {
  it("reduces an activity-only step to its shape, stating no content", () => {
    const step = taughtStepFromActivities({
      title: "Group the digits",
      teacherActivity: "Model grouping in threes.",
      learnerActivity: "Group two numbers.",
    });

    expect(step.summary).toBe("Model grouping in threes. Group two numbers.");
    expect(step.taught).toEqual([]);
    expect(step.workedExamples).toEqual([]);
    expect(step.practice).toEqual([]);
  });
});
