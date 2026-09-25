import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-db";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { appCall } from "@/lib/a2a/request-data";
import {
  followUpsFor,
  threadState,
  type ThreadState,
} from "@/features/learn/lib/chat-view-state";

const CARD: TutorCard = {
  resourceUri: "ui://practice",
  toolName: "give_practice",
  toolInput: {},
  toolResult: { content: [] },
};
const answer = (metadata: ChatMessage["metadata"]): ChatMessage => ({
  id: "m1",
  threadId: "t1",
  type: "complete",
  content: "An answer",
  timestamp: 1,
  sender: "ai",
  metadata,
});
const IDLE: ThreadState = {
  answering: false,
  planChange: null,
  changingPlan: false,
  blocked: false,
};
const FOLLOW_UPS = ["Why?", "How?"];

describe("threadState", () => {
  const tutor = {
    busyThreadId: null,
    planChangeThreadId: null,
    pendingPlanChange: null,
    isChangingPlan: false,
  };

  it("is idle when nothing runs", () => {
    expect(threadState(tutor, "t1", false)).toEqual(IDLE);
  });

  it("answers in the busy thread and blocks every thread", () => {
    const busy = { ...tutor, busyThreadId: "t1" };
    expect(threadState(busy, "t1", false)).toMatchObject({
      answering: true,
      blocked: true,
    });
    expect(threadState(busy, "t2", false)).toMatchObject({
      answering: false,
      blocked: true,
    });
  });

  it("shows a plan change only in the thread it came from", () => {
    const change = {
      ...tutor,
      planChangeThreadId: "t1",
      pendingPlanChange: { type: "rebuild_plan" } as const,
      isChangingPlan: true,
    };
    expect(threadState(change, "t1", false)).toMatchObject({
      planChange: { type: "rebuild_plan" },
      changingPlan: true,
      blocked: true,
    });
    expect(threadState(change, "t2", false)).toMatchObject({
      planChange: null,
      changingPlan: false,
    });
  });

  it("blocks while the plan is being made", () => {
    expect(threadState(tutor, null, true).blocked).toBe(true);
  });
});

describe("followUpsFor", () => {
  it("offers a complete answer's follow-ups", () => {
    expect(followUpsFor(answer({ followUps: FOLLOW_UPS }), IDLE)).toEqual(
      FOLLOW_UPS,
    );
  });

  it("offers nothing while the tutor answers or a plan change waits", () => {
    const last = answer({ followUps: FOLLOW_UPS });
    expect(followUpsFor(last, { ...IDLE, answering: true })).toEqual([]);
    expect(
      followUpsFor(last, { ...IDLE, planChange: { type: "rebuild_plan" } }),
    ).toEqual([]);
  });

  it("offers nothing below the learner's own message or no message", () => {
    const question = { ...answer({ followUps: FOLLOW_UPS }), sender: "user" };
    expect(followUpsFor(question as ChatMessage, IDLE)).toEqual([]);
    expect(followUpsFor(undefined, IDLE)).toEqual([]);
  });

  it("waits for a card to be answered before offering follow-ups", () => {
    expect(
      followUpsFor(answer({ card: CARD, followUps: FOLLOW_UPS }), IDLE),
    ).toEqual([]);
    const answered = answer({
      card: CARD,
      followUps: FOLLOW_UPS,
      viewCalls: [appCall("record_answer", {})],
    });
    expect(followUpsFor(answered, IDLE)).toEqual(FOLLOW_UPS);
  });

  it("ignores follow-ups that are not a list", () => {
    const odd = answer({ followUps: "Why?" as unknown as string[] });
    expect(followUpsFor(odd, IDLE)).toEqual([]);
  });
});
