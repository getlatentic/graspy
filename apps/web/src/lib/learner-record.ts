import { toApiError, toNetworkError } from "@/lib/api/errors";
import { getJson } from "@/lib/api/request";
import { fetchWithSession } from "@/lib/api/session";
import {
  clearDeviceRecords,
  deviceRecords,
  isEmpty,
} from "@/lib/device-records";
import { API_BASE_URL } from "@/lib/env";

// The learner's record as the server keeps it (app/learner/record.py).

export interface TopicRef {
  planId: string;
  subjectSlug: string;
  topicIndex: number;
  topic: string;
}

export interface TopicMark extends TopicRef {
  lessonId?: string | null;
  learntAt?: number | null;
}

export interface RecordedAnswer {
  planId?: string | null;
  subjectSlug?: string | null;
  topic?: string | null;
  source: "practice" | "lesson";
  question: string;
  correct: boolean;
  at: number;
}

export interface LearnerRecord {
  topics: TopicMark[];
  answers: RecordedAnswer[];
}

type PlanChange =
  | { kind: "subject_dropped"; planId: string; subjectSlug: string }
  | {
      kind: "subjects_carried";
      fromPlan: string;
      toPlan: string;
      subjectSlugs: string[];
    }
  | { kind: "plan_kept"; planId: string };

const IMPORTED_KEY = "graspy.records.imported";
// The last record read, per plan, for offline.
const recordKey = (planId: string) => `graspy.learner.${planId}`;

let importing: Promise<void> | null = null;

function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage refused: nothing is remembered, and nothing is lost.
  }
}

async function post(path: string, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetchWithSession(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }
  if (!response.ok) throw await toApiError(response);
}

async function importOnce(): Promise<void> {
  const records = await deviceRecords();
  if (!isEmpty(records)) {
    await post("/learner/import", records);
    await clearDeviceRecords();
  }
  remember(IMPORTED_KEY, "1");
}

// A failure is tried again next time.
function importDeviceRecords(): Promise<void> {
  if (remembered(IMPORTED_KEY)) return Promise.resolve();
  importing ??= importOnce().catch((error: unknown) => {
    importing = null;
    throw error;
  });
  return importing;
}

export function keptRecord(planId: string): LearnerRecord | null {
  const kept = remembered(recordKey(planId));
  return kept ? (JSON.parse(kept) as LearnerRecord) : null;
}

export async function learnerRecord(planId: string): Promise<LearnerRecord> {
  await importDeviceRecords().catch((error: unknown) =>
    console.warn("Bringing this device's records across failed:", error),
  );
  try {
    const record = await getJson<LearnerRecord>(
      `${API_BASE_URL}/learner?planId=${encodeURIComponent(planId)}`,
    );
    remember(recordKey(planId), JSON.stringify(record));
    return record;
  } catch (error) {
    const kept = keptRecord(planId);
    if (kept) return kept;
    throw error;
  }
}

// A lesson finished offline stays finished here until the server's record says so.
export function rememberMark(topic: TopicRef, kind: "learnt" | "ready"): void {
  const kept = remembered(recordKey(topic.planId));
  const record: LearnerRecord = kept
    ? (JSON.parse(kept) as LearnerRecord)
    : { topics: [], answers: [] };
  const same = (mark: TopicMark) =>
    mark.subjectSlug === topic.subjectSlug &&
    mark.topicIndex === topic.topicIndex &&
    mark.topic === topic.topic;
  const mark = record.topics.find(same) ?? { ...topic };
  record.topics = [
    ...record.topics.filter((other) => !same(other)),
    withMark(mark, kind),
  ];
  remember(recordKey(topic.planId), JSON.stringify(record));
}

/** A lesson marked ready on this device before the server's record names it. */
export const ON_THIS_DEVICE = "on-this-device";

function withMark(mark: TopicMark, kind: "learnt" | "ready"): TopicMark {
  return kind === "learnt"
    ? { ...mark, learntAt: mark.learntAt ?? Date.now() }
    : { ...mark, lessonId: mark.lessonId ?? ON_THIS_DEVICE };
}

export function changePlanRecord(change: PlanChange): Promise<void> {
  return post("/learner/plan", change);
}

export function planMarks(record: LearnerRecord): {
  learnt: TopicMark[];
  ready: TopicMark[];
} {
  return {
    learnt: record.topics.filter((mark) => mark.learntAt),
    ready: record.topics.filter((mark) => mark.lessonId),
  };
}

interface PracticeTally {
  answered: number;
  right: number;
}

// Questions asked outside a subject count toward the total only.
export function tally(answers: RecordedAnswer[]): {
  total: PracticeTally;
  bySubject: Map<string, PracticeTally>;
} {
  const total = { answered: 0, right: 0 };
  const bySubject = new Map<string, PracticeTally>();
  for (const answer of answers) {
    if (answer.source !== "practice") continue;
    const counts = [total];
    if (answer.subjectSlug) {
      const subject = bySubject.get(answer.subjectSlug) ?? {
        answered: 0,
        right: 0,
      };
      bySubject.set(answer.subjectSlug, subject);
      counts.push(subject);
    }
    for (const count of counts) {
      count.answered += 1;
      if (answer.correct) count.right += 1;
    }
  }
  return { total, bySubject };
}
