import type { planMarks, TopicRef } from "@/lib/learner-record";

type PlanMarks = ReturnType<typeof planMarks>;

export interface TopicMarks {
  learnt: ReadonlySet<string>;
  ready: ReadonlySet<string>;
}

export type Standing = "learnt" | "ready" | "not-started";

export const NO_MARKS: TopicMarks = { learnt: new Set(), ready: new Set() };

const keyOf = (subjectSlug: string, topicIndex: number, topic: string) =>
  JSON.stringify([subjectSlug, topicIndex, topic]);

const keysOf = (refs: TopicRef[]) =>
  new Set(refs.map((ref) => keyOf(ref.subjectSlug, ref.topicIndex, ref.topic)));

export function marksFrom(marks: PlanMarks): TopicMarks {
  return { learnt: keysOf(marks.learnt), ready: keysOf(marks.ready) };
}

export function withMark(
  marks: TopicMarks,
  kind: keyof TopicMarks,
  ref: Omit<TopicRef, "planId">,
): TopicMarks {
  const added = new Set(marks[kind]);
  added.add(keyOf(ref.subjectSlug, ref.topicIndex, ref.topic));
  return { ...marks, [kind]: added };
}

export function standingOf(
  marks: TopicMarks,
  subjectSlug: string,
  topicIndex: number,
  topic: string,
): Standing {
  const key = keyOf(subjectSlug, topicIndex, topic);
  if (marks.learnt.has(key)) return "learnt";
  return marks.ready.has(key) ? "ready" : "not-started";
}

export function learntIn(
  marks: TopicMarks,
  subjectSlug: string,
  topics: string[],
): number {
  return topics.filter((topic, index) =>
    marks.learnt.has(keyOf(subjectSlug, index, topic)),
  ).length;
}

/** -1 when all are learnt. An unlearnt path goal comes first: it is what the learner asked for. */
export function nextToLearn(
  marks: TopicMarks,
  subjectSlug: string,
  topics: string[],
  goal = -1,
): number {
  const learnt = (index: number) =>
    marks.learnt.has(keyOf(subjectSlug, index, topics[index]));
  if (goal >= 0 && goal < topics.length && !learnt(goal)) return goal;
  return topics.findIndex((_, index) => !learnt(index));
}
