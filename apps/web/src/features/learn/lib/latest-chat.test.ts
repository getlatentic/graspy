import { describe, expect, it } from "vitest";
import { latestChat } from "@/features/learn/lib/latest-chat";
import type { ChatThread } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import type { CurrentTopic } from "@/features/learn/lib/current-topic";

const MATHS = { name: "Mathematics", slug: "mathematics" };
const PLAN: CurriculumData = {
  id: "current",
  planId: "plan-1",
  country: "NG",
  language: "en",
  gradeLevel: "Grade 7",
  subjects: [MATHS],
  topics: { mathematics: ["Fractions", "Decimals"] },
  createdAt: 1,
  updatedAt: 1,
};
const CURRENT: CurrentTopic = {
  subject: MATHS,
  topics: ["Fractions", "Decimals"],
  topicIndex: 0,
  topic: "Fractions",
  started: false,
};
const thread = (scope: ChatThread["scope"]): ChatThread => ({
  id: JSON.stringify(scope),
  scope,
  createdAt: 1,
  updatedAt: 1,
});

describe("latestChat", () => {
  it("opens the most recent conversation that still belongs to the plan", () => {
    const threads = [
      thread({ kind: "earlier" }),
      thread({ kind: "general", planId: "old-plan" }),
      thread({
        kind: "topic",
        planId: "plan-1",
        subjectSlug: "mathematics",
        topic: "Decimals",
      }),
      thread({ kind: "general", planId: "plan-1" }),
    ];
    expect(latestChat(threads, PLAN, CURRENT)).toEqual({
      kind: "topic",
      subjectSlug: "mathematics",
      topicIndex: 1,
    });
  });

  it("falls back to the current topic, then to asking anything", () => {
    expect(latestChat([], PLAN, CURRENT)).toEqual({
      kind: "topic",
      subjectSlug: "mathematics",
      topicIndex: 0,
    });
    expect(latestChat([], PLAN, null)).toEqual({ kind: "general" });
  });
});
