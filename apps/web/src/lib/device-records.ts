import {
  committed,
  LESSON_STORE,
  openDB,
  PRACTICE_STORE,
  PROGRESS_STORE,
  promisify,
} from "@/lib/idb";
import type {
  LearntTopic,
  LessonContentPayload,
  PracticeRecord,
  StoredLesson,
} from "@/lib/learning-records";
import type { TopicRef } from "@/lib/learner-record";

// Must match the server's api/learner_routes.DeviceRecords.
interface DeviceRecords {
  topics: (TopicRef & { learntAt: number })[];
  answers: {
    planId: string;
    subjectSlug?: string;
    topic?: string;
    key: string;
    source: "practice";
    question: string;
    correct: boolean;
    at: number;
  }[];
  lessons: { topic: TopicRef; lesson: LessonContentPayload }[];
}

const STORES = [LESSON_STORE, PROGRESS_STORE, PRACTICE_STORE];

const refOf = ({ planId, subjectSlug, topicIndex, topic }: TopicRef) => ({
  planId,
  subjectSlug,
  topicIndex,
  topic,
});

export async function deviceRecords(): Promise<DeviceRecords> {
  const db = await openDB();
  const tx = db.transaction(STORES, "readonly");
  const all = <T>(name: string) =>
    promisify<T[]>(tx.objectStore(name).getAll());
  const [lessons, learnt, practice] = await Promise.all([
    all<StoredLesson>(LESSON_STORE),
    all<LearntTopic>(PROGRESS_STORE),
    all<PracticeRecord>(PRACTICE_STORE),
  ]);
  return {
    topics: learnt.map((mark) => ({ ...refOf(mark), learntAt: mark.learntAt })),
    answers: practice.map((answer) => ({
      planId: answer.planId,
      ...(answer.subjectSlug ? { subjectSlug: answer.subjectSlug } : {}),
      ...(answer.topic ? { topic: answer.topic } : {}),
      key: `${answer.messageId}:${answer.question}`.slice(0, 120),
      source: "practice",
      question: answer.question,
      correct: answer.correct,
      at: answer.answeredAt,
    })),
    lessons: lessons.map((kept) => ({
      topic: refOf(kept),
      lesson: kept.lesson,
    })),
  };
}

export const isEmpty = (records: DeviceRecords) =>
  records.topics.length + records.answers.length + records.lessons.length === 0;

export async function clearDeviceRecords(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES, "readwrite");
  const done = committed(tx);
  for (const name of STORES) tx.objectStore(name).clear();
  await done;
}
