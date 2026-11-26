import type { ChatMessage, ThreadScope } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import type { PendingPlanChange } from "../hooks/use-tutor-actions";
import { subjectOf } from "./chat-targets";
import { awaitsChoice } from "./choice-card";
import type { Translate } from "@/lib/i18n-context";

/** Shown in place of the tutor's activity while the connection to the turn is down. */
export const RECONNECTING = "reconnecting";

interface TutorState {
  busyThreadId: string | null;
  planChangeThreadId: string | null;
  pendingPlanChange: PendingPlanChange | null;
  isChangingPlan: boolean;
}

export interface ThreadState {
  answering: boolean;
  planChange: PendingPlanChange | null;
  changingPlan: boolean;
  /** One turn at a time across conversations, so a double tap cannot fire two agent calls. */
  blocked: boolean;
}

export function threadState(
  tutor: TutorState,
  threadId: string | null,
  isGenerating: boolean,
): ThreadState {
  const answering =
    tutor.busyThreadId !== null && tutor.busyThreadId === threadId;
  const here =
    tutor.planChangeThreadId !== null && tutor.planChangeThreadId === threadId;
  return {
    answering,
    planChange: here ? tutor.pendingPlanChange : null,
    changingPlan: here && tutor.isChangingPlan,
    blocked:
      isGenerating || tutor.busyThreadId !== null || tutor.isChangingPlan,
  };
}

/** The plan change to show under the composer: none while a question waits for its answer,
 * since two cards each asking the learner to decide are one too many. */
export function planChangeFor(
  last: ChatMessage | undefined,
  state: ThreadState,
): PendingPlanChange | null {
  return awaitsChoice(last) ? null : state.planChange;
}

// Only a complete answer offers follow-ups: mid-stream they make the page jump,
// and beside a waiting card or plan change they compete with the next step.
export function followUpsFor(
  last: ChatMessage | undefined,
  state: ThreadState,
): string[] {
  if (state.answering || state.planChange || last?.sender !== "ai") return [];
  const { card, viewCalls, followUps } = last.metadata ?? {};
  if (card !== undefined && !viewCalls?.length) return [];
  return Array.isArray(followUps) ? followUps : [];
}

export function scopeSubjectName(
  curriculum: CurriculumData | null,
  scope: ThreadScope,
): string {
  if (scope.kind !== "topic" && scope.kind !== "subject") return "";
  return subjectOf(curriculum, scope.subjectSlug)?.name ?? "";
}

export function composerPlaceholder(
  scope: ThreadScope,
  subjectName: string,
  t: Translate,
): string {
  if (scope.kind === "topic") {
    return t("chat.draftPlaceholderTopic", { topic: scope.topic });
  }
  if (scope.kind === "subject") {
    return t("chat.draftPlaceholderTopic", { topic: subjectName });
  }
  return t("ask.anythingPlaceholder");
}
