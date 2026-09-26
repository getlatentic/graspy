import type { CallToolResult } from "@modelcontextprotocol/client";
import type { TutorCard } from "@/lib/a2a/reply-data";
import type { CurriculumData } from "@/lib/curriculum-record";
import {
  copiedTopics,
  dropLessonCopies,
  keepLessonCopy,
  lessonCopy,
} from "@/lib/lesson-copies";
import type { TopicRef } from "@/lib/learner-record";
import { isUnreachable } from "@/lib/mcp/outbox";
import { callAppTool } from "@/lib/mcp/server";
import {
  keptLesson,
  lessonStateOf,
  lessonTarget,
  openLesson,
  type LessonTarget,
} from "./lesson-app";

// Whole lessons are copied to the device and stand in for the server while it is unreachable.

const isWhole = (result: CallToolResult) => {
  const state = lessonStateOf(result);
  return state?.status === "ready" && state.whole;
};

export async function keepIfWhole(
  target: LessonTarget,
  card: TutorCard,
): Promise<void> {
  if (!isWhole(card.toolResult)) return;
  await keepLessonCopy(target, card).catch((error: unknown) =>
    console.warn("Keeping a copy of the lesson failed:", error),
  );
}

export async function openLessonOrCopy(
  target: LessonTarget,
  attempt = 0,
): Promise<TutorCard> {
  try {
    const card = await openLesson(target, attempt);
    await keepIfWhole(target, card);
    return card;
  } catch (error) {
    const copy = isUnreachable(error) ? await lessonCopy(target) : null;
    if (copy) return copy;
    throw error;
  }
}

export async function lessonToolOrCopy(
  target: LessonTarget,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    return await callAppTool(name, args);
  } catch (error) {
    const copy = isUnreachable(error) ? await lessonCopy(target) : null;
    if (copy) return copy.toolResult;
    throw error;
  }
}

const sameTopic = (a: TopicRef, b: TopicRef) =>
  a.planId === b.planId &&
  a.subjectSlug === b.subjectSlug &&
  a.topicIndex === b.topicIndex &&
  a.topic === b.topic;

async function copyAll(plan: CurriculumData, ready: TopicRef[]) {
  const wanted = ready.filter((mark) => mark.planId === plan.planId);
  const copied = await copiedTopics();
  await dropLessonCopies(
    copied.filter((copy) => !wanted.some((mark) => sameTopic(mark, copy))),
  );
  for (const mark of wanted) {
    if (copied.some((copy) => sameTopic(copy, mark))) continue;
    const subject = plan.subjects.find((s) => s.slug === mark.subjectSlug);
    const target = subject && lessonTarget(plan, subject, mark.topicIndex);
    if (!target || target.topic !== mark.topic) continue;
    await keepIfWhole(target, await keptLesson(target));
  }
}

let copying: Promise<void> | null = null;

/** Copies exactly the plan's ready lessons, including ones made on another device. */
export function copyReadyLessons(
  plan: CurriculumData,
  ready: TopicRef[],
): Promise<void> {
  copying ??= copyAll(plan, ready).finally(() => {
    copying = null;
  });
  return copying;
}
