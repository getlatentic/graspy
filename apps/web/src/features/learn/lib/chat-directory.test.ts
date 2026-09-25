import { describe, expect, it } from "vitest";
import type { ChatThread, ThreadScope } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { chatDirectory } from "@/features/learn/lib/chat-directory";
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
const topicScope = (topic: string, planId = "plan-1"): ThreadScope => ({
  kind: "topic",
  planId,
  subjectSlug: "mathematics",
  topic,
});
const thread = (id: string, scope: ThreadScope): ChatThread => ({
  id,
  scope,
  createdAt: 1,
  updatedAt: 1,
});

describe("chatDirectory", () => {
  it("offers the current topic unless its conversation is open", () => {
    expect(chatDirectory([], PLAN, CURRENT, undefined).topic).toMatchObject({
      topic: "Fractions",
      target: { kind: "topic", subjectSlug: "mathematics", topicIndex: 0 },
    });
    expect(
      chatDirectory([], PLAN, CURRENT, topicScope("Fractions")).topic,
    ).toBeNull();
    expect(chatDirectory([], PLAN, null, undefined).topic).toBeNull();
  });

  it("lists this plan's topic and subject conversations, not the open one", () => {
    const threads = [
      thread("a", topicScope("Decimals")),
      thread("b", topicScope("Fractions")),
      thread("c", topicScope("Fractions", "plan-0")),
      thread("d", {
        kind: "subject",
        planId: "plan-1",
        subjectSlug: "mathematics",
      }),
      thread("e", { kind: "general", planId: "plan-1" }),
      thread("f", { kind: "earlier" }),
    ];
    const { recent, anything, offerEarlier } = chatDirectory(
      threads,
      PLAN,
      CURRENT,
      topicScope("Fractions"),
    );
    expect(recent.map((entry) => entry.thread.id)).toEqual(["a", "d"]);
    expect(recent[0].target).toEqual({
      kind: "topic",
      subjectSlug: "mathematics",
      topicIndex: 1,
    });
    expect(anything && anything.thread?.id).toBe("e");
    expect(offerEarlier).toBe(true);
  });
});

describe("chatDirectory's fixed rows", () => {
  it("leaves out a conversation about anything from an earlier plan", () => {
    const threads = [thread("g", { kind: "general", planId: "plan-0" })];
    const { anything, offerEarlier, offerTopics } = chatDirectory(
      threads,
      PLAN,
      null,
      undefined,
    );
    expect(anything).toEqual({ thread: undefined });
    expect(offerEarlier).toBe(false);
    expect(offerTopics).toBe(true);
  });

  it("offers no row for the conversation already open", () => {
    const threads = [thread("f", { kind: "earlier" })];
    expect(
      chatDirectory(threads, PLAN, null, { kind: "general", planId: "plan-1" })
        .anything,
    ).toBe(false);
    expect(
      chatDirectory(threads, PLAN, null, { kind: "earlier" }).offerEarlier,
    ).toBe(false);
    expect(chatDirectory([], null, null, undefined).offerTopics).toBe(false);
  });
});
