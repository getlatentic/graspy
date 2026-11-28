import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-db";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { appCall } from "@/lib/a2a/request-data";
import {
  followUpsFor,
  isWelcoming,
  planChangeFor,
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

describe("planChangeFor", () => {
  const REBUILD = { type: "rebuild_plan" } as const;
  const waiting = { ...IDLE, planChange: REBUILD };
  const CHOICE: TutorCard = { ...CARD, resourceUri: "ui://graspy/choice" };

  it("shows the plan change that waits", () => {
    expect(planChangeFor(answer({}), waiting)).toBe(REBUILD);
    expect(planChangeFor(undefined, waiting)).toBe(REBUILD);
  });

  it("shows none while a question waits for its answer", () => {
    expect(planChangeFor(answer({ card: CHOICE }), waiting)).toBeNull();
  });

  it("shows none while the About you form waits for its answer", () => {
    const form: TutorCard = { ...CARD, resourceUri: "ui://graspy/details" };

    expect(planChangeFor(answer({ card: form }), waiting)).toBeNull();
  });

  it("shows it below a card of questions, which is not a decision to make", () => {
    expect(planChangeFor(answer({ card: CARD }), waiting)).toBe(REBUILD);
  });

  it("shows it again when the learner's own message is the last", () => {
    const typed = {
      ...answer({ card: CHOICE }),
      sender: "user",
    } as ChatMessage;
    expect(planChangeFor(typed, waiting)).toBe(REBUILD);
  });
});

describe("isWelcoming", () => {
  const general = { kind: "general", planId: "p" } as const;
  const earlier = { kind: "earlier", planId: "p" } as never;
  const READ = { threadsLoaded: true, ready: true, sending: false };

  it("is the read, empty, idle conversation", () => {
    expect(isWelcoming(general, READ, 0, IDLE)).toBe(true);
  });

  it("is not before the device's conversations are read: the chat may have saved messages", () => {
    expect(isWelcoming(general, { ...READ, threadsLoaded: false }, 0, IDLE)).toBe(
      false,
    );
  });

  it("is not before the conversation's messages are read", () => {
    expect(isWelcoming(general, { ...READ, ready: false }, 0, IDLE)).toBe(false);
  });

  it("holds while the first question is on its way, read or not, so no frame is blank", () => {
    const sent = { threadsLoaded: true, ready: false, sending: true };
    expect(isWelcoming(general, sent, 0, IDLE)).toBe(true);
    expect(isWelcoming(general, sent, 0, { ...IDLE, answering: true })).toBe(true);
  });

  it("is not once there is a message, even while sending", () => {
    expect(isWelcoming(general, READ, 1, IDLE)).toBe(false);
    expect(isWelcoming(general, { ...READ, sending: true }, 1, IDLE)).toBe(false);
  });

  it("is not while a turn this view did not send is answered, or a plan changes", () => {
    expect(isWelcoming(general, READ, 0, { ...IDLE, answering: true })).toBe(
      false,
    );
    expect(isWelcoming(general, READ, 0, { ...IDLE, changingPlan: true })).toBe(
      false,
    );
  });

  it("is not for an earlier thread, which has no composer", () => {
    expect(isWelcoming(earlier, READ, 0, IDLE)).toBe(false);
  });
});
