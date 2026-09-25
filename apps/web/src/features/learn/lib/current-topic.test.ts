import { describe, expect, it } from "vitest";
import { currentTopic } from "@/features/learn/lib/current-topic";
import type { CurriculumData, LearningSession } from "@/lib/curriculum-record";

const MATHS = { name: "Mathematics", slug: "mathematics" };
const SCIENCE = { name: "Basic Science", slug: "basic-science" };

function plan(session?: Partial<LearningSession>): CurriculumData {
  return {
    id: "current",
    planId: "plan-1",
    country: "NG",
    language: "en",
    gradeLevel: "Grade 7",
    subjects: [MATHS, SCIENCE],
    topics: {
      mathematics: ["Fractions", "Decimals"],
      "basic-science": ["Living things"],
    },
    activeSession: session as LearningSession | undefined,
    createdAt: 1,
    updatedAt: 1,
  };
}

const DECIMALS_OPEN = {
  subject: "Mathematics",
  topic: "Decimals",
  topicIndex: 1,
  phase: "explanation",
} as const;

describe("currentTopic", () => {
  it("is the open lesson when it is in the next subject", () => {
    expect(currentTopic(plan(DECIMALS_OPEN), MATHS)).toMatchObject({
      topic: "Decimals",
      topicIndex: 1,
      started: true,
    });
  });

  it("is the next subject's first topic otherwise", () => {
    expect(currentTopic(plan(DECIMALS_OPEN), SCIENCE)).toMatchObject({
      topic: "Living things",
      topicIndex: 0,
      started: false,
    });
  });

  it("follows the open lesson's subject when there is no next subject", () => {
    const current = currentTopic(
      plan({
        subject: "Basic Science",
        topic: "Living things",
        topicIndex: 0,
        phase: "complete",
      }),
      null,
    );
    expect(current).toMatchObject({ subject: SCIENCE, started: false });
  });

  it("is a path's goal, not the first step to it", () => {
    const withPath: CurriculumData = {
      ...plan(),
      subjects: [MATHS, { name: "Real analysis", slug: "real-analysis" }],
      topics: {
        ...plan().topics,
        "real-analysis": ["Sequences", "Limits", "Continuity"],
      },
      goals: { "real-analysis": "Continuity" },
    };

    expect(currentTopic(withPath, withPath.subjects[1])).toMatchObject({
      topic: "Continuity",
      topicIndex: 2,
      started: false,
    });
  });

  it("is nothing without a plan", () => {
    expect(currentTopic(null, null)).toBeNull();
  });
});
