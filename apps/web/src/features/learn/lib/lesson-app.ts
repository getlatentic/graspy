import type { CallToolResult } from "@modelcontextprotocol/client";
import type { TutorCard } from "@/lib/a2a/reply-data";
import {
  topicsOf,
  type CurriculumData,
  type CurriculumSubject,
} from "@/lib/curriculum-record";
import { callAppTool, openToolView, viewOf } from "@/lib/mcp/server";
import { goalIndex, topicLevel } from "./curriculum-edit";

const GIVE_LESSON = "give_lesson";
const LESSON_PROGRESS = "lesson_progress";
export const FINISH_LESSON = "finish_lesson";
const WATCH_MS = 2500;

/** Mirrors the server's lessons/making.LessonTarget. */
export interface LessonTarget {
  planId: string;
  subjectSlug: string;
  subject: string;
  topicIndex: number;
  topic: string;
  totalTopics: number;
  country: string;
  language: string;
  gradeLevel: string;
  /** A path goal's unlearnt earlier steps, which its lesson recaps. */
  buildsOn?: string[];
}

interface LessonState {
  status: "making" | "ready" | "failed";
  whole: boolean;
  lesson: unknown;
}

export function lessonTarget(
  plan: CurriculumData,
  subject: CurriculumSubject,
  topicIndex: number,
  learnt: (index: number) => boolean = () => false,
): LessonTarget | null {
  const topics = topicsOf(plan, subject.slug);
  const topic = topics[topicIndex];
  if (!topic) return null;
  const buildsOn =
    topicIndex === goalIndex(plan, subject.slug)
      ? topics.slice(0, topicIndex).filter((_, index) => !learnt(index))
      : [];
  return {
    planId: plan.planId,
    subjectSlug: subject.slug,
    subject: subject.name,
    topicIndex,
    topic,
    totalTopics: topics.length,
    country: plan.country,
    language: plan.language,
    gradeLevel: topicLevel(plan, subject, topic),
    ...(buildsOn.length ? { buildsOn } : {}),
  };
}

function nextTopicAfter(
  topics: string[],
  current: number,
  learnt: (index: number) => boolean,
): number {
  const open = (index: number) => index !== current && !learnt(index);
  const after = topics.findIndex((_, index) => index > current && open(index));
  return after >= 0 ? after : topics.findIndex((_, index) => open(index));
}

export function nextLesson(
  plan: CurriculumData,
  subject: CurriculumSubject,
  current: number,
  learnt: (index: number) => boolean,
): { index: number; topic: string; target: LessonTarget | null } | null {
  const topics = topicsOf(plan, subject.slug);
  const index = nextTopicAfter(topics, current, learnt);
  if (index < 0) return null;
  return {
    index,
    topic: topics[index],
    target: lessonTarget(plan, subject, index, learnt),
  };
}

/** `attempt` goes up only when the learner retries after a failure. */
export function openLesson(
  target: LessonTarget,
  attempt = 0,
): Promise<TutorCard> {
  return openToolView(GIVE_LESSON, { target, attempt });
}

/**
 * The lesson as `openLesson` would open it, asked with lesson_progress, which never starts one:
 * give_lesson would pay to make a lesson the learner has not opened.
 */
export async function keptLesson(target: LessonTarget): Promise<TutorCard> {
  const toolInput = { target, attempt: 0 };
  const resourceUri = await viewOf(GIVE_LESSON);
  const toolResult = await callAppTool(LESSON_PROGRESS, toolInput);
  return { resourceUri, toolName: GIVE_LESSON, toolInput, toolResult };
}

export function lessonStateOf(result: CallToolResult): LessonState | null {
  const state = result.structuredContent as Partial<LessonState> | undefined;
  return typeof state?.status === "string" ? (state as LessonState) : null;
}

export function objectivesOf(result: CallToolResult | undefined): string[] {
  const lesson = (result && lessonStateOf(result)?.lesson) as {
    objectives?: unknown;
  } | null;
  const objectives = lesson?.objectives;
  return Array.isArray(objectives)
    ? objectives.filter((item): item is string => typeof item === "string")
    : [];
}

export const isLessonTool = (name: string) =>
  name === GIVE_LESSON || name === LESSON_PROGRESS;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function lessonMade(target: LessonTarget): Promise<LessonState> {
  let state = lessonStateOf((await openLesson(target)).toolResult);
  while (state?.status === "making") {
    await wait(WATCH_MS);
    state = lessonStateOf(await callAppTool(LESSON_PROGRESS, { target }));
  }
  if (state?.status !== "ready" || !state.lesson) {
    throw new Error("The lesson could not be made");
  }
  return state;
}
