import type { TutorCard } from "@/lib/a2a/reply-data";
import { committed, LESSON_COPY_STORE, openDB, promisify } from "@/lib/idb";
import type { TopicRef } from "@/lib/learner-record";

// The lesson view's card as the server last gave it, to open offline.

interface LessonCopy extends TopicRef {
  card: TutorCard;
  savedAt: number;
}

const keyOf = (ref: TopicRef): IDBValidKey => [
  ref.planId,
  ref.subjectSlug,
  ref.topicIndex,
  ref.topic,
];

export async function keepLessonCopy(
  ref: TopicRef,
  card: TutorCard,
): Promise<void> {
  const db = await openDB();
  const store = db
    .transaction(LESSON_COPY_STORE, "readwrite")
    .objectStore(LESSON_COPY_STORE);
  const copy: LessonCopy = {
    planId: ref.planId,
    subjectSlug: ref.subjectSlug,
    topicIndex: ref.topicIndex,
    topic: ref.topic,
    card,
    savedAt: Date.now(),
  };
  await promisify(store.put(copy));
}

export async function lessonCopy(ref: TopicRef): Promise<TutorCard | null> {
  const db = await openDB();
  const store = db
    .transaction(LESSON_COPY_STORE, "readonly")
    .objectStore(LESSON_COPY_STORE);
  const copy = await promisify<LessonCopy | undefined>(store.get(keyOf(ref)));
  return copy?.card ?? null;
}

export async function copiedTopics(): Promise<TopicRef[]> {
  const db = await openDB();
  const store = db
    .transaction(LESSON_COPY_STORE, "readonly")
    .objectStore(LESSON_COPY_STORE);
  const keys = await promisify(store.getAllKeys());
  return keys.map((key) => {
    const [planId, subjectSlug, topicIndex, topic] = key as [
      string,
      string,
      number,
      string,
    ];
    return { planId, subjectSlug, topicIndex, topic };
  });
}

export async function dropLessonCopies(refs: TopicRef[]): Promise<void> {
  if (refs.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(LESSON_COPY_STORE, "readwrite");
  const done = committed(tx);
  for (const ref of refs) tx.objectStore(LESSON_COPY_STORE).delete(keyOf(ref));
  await done;
}
