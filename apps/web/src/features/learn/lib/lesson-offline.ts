import type { CallToolResult } from "@modelcontextprotocol/client";
import type { TutorCard } from "@/lib/a2a/reply-data";
import type { CurriculumData } from "@/lib/curriculum-record";
import {
  copiedLessons,
  dropLessonCopies,
  keepLessonCopy,
  lessonCopy,
  type CopiedLesson,
} from "@/lib/lesson-copies";
import {
  ON_THIS_DEVICE,
  type TopicMark,
  type TopicRef,
} from "@/lib/learner-record";
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

/** `onRecord` names the lesson for a server that leaves its id out of the result. */
export async function keepIfWhole(
  target: LessonTarget,
  card: TutorCard,
  onRecord: string | null = null,
): Promise<void> {
  if (!isWhole(card.toolResult)) return;
  const lessonId = lessonStateOf(card.toolResult)?.lessonId ?? onRecord;
  await keepLessonCopy(target, card, lessonId).catch((error: unknown) =>
    console.warn("Keeping a copy of the lesson failed:", error),
  );
}

export async function openLessonOrCopy(
  target: LessonTarget,
  attempt = 0,
): Promise<TutorCard> {
  try {
    const card = await openLesson(target, attempt);
    gone.delete(topicKey(target));
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

const topicKey = (ref: TopicRef) =>
  JSON.stringify([ref.planId, ref.subjectSlug, ref.topicIndex, ref.topic]);

// Topics whose lesson the server no longer has though the record names it, by the lessonId named, with
// nothing making it: it answers the same until the learner opens the topic, so this tab does not ask again.
const gone = new Map<string, string | null>();

function needsCopy(mark: TopicMark, copied: CopiedLesson[]): boolean {
  // A mark made on this device names no lesson to compare: the copy was kept as the lesson opened here,
  // and the server's record names the lesson once read.
  if (mark.lessonId === ON_THIS_DEVICE) return false;
  const lessonId = mark.lessonId ?? null;
  if (gone.get(topicKey(mark)) === lessonId) return false;
  return !copied.some(
    (copy) => sameTopic(copy, mark) && copy.lessonId === lessonId,
  );
}

// A lesson the server refuses is skipped; a server that cannot be reached ends the run.
async function copyOne(target: LessonTarget, lessonId: string | null) {
  try {
    const card = await keptLesson(target);
    if (lessonStateOf(card.toolResult)?.status === "failed")
      gone.set(topicKey(target), lessonId);
    await keepIfWhole(target, card, lessonId);
  } catch (error) {
    if (isUnreachable(error)) throw error;
    console.warn(`Copying the lesson on ${target.topic} failed:`, error);
  }
}

async function copyAll(plan: CurriculumData, ready: TopicMark[]) {
  const wanted = ready.filter((mark) => mark.planId === plan.planId);
  const copied = await copiedLessons();
  await dropLessonCopies(
    copied.filter((copy) => !wanted.some((mark) => sameTopic(mark, copy))),
  );
  for (const mark of wanted) {
    if (!needsCopy(mark, copied)) continue;
    const subject = plan.subjects.find((s) => s.slug === mark.subjectSlug);
    const target = subject && lessonTarget(plan, subject, mark.topicIndex);
    if (!target || target.topic !== mark.topic) continue;
    await copyOne(target, mark.lessonId ?? null);
  }
}

let copying: Promise<void> | null = null;

/** Copies exactly the plan's ready lessons, including ones made on another device. */
export function copyReadyLessons(
  plan: CurriculumData,
  ready: TopicMark[],
): Promise<void> {
  copying ??= copyAll(plan, ready).finally(() => {
    copying = null;
  });
  return copying;
}
