import type { TutorCard } from "@/lib/a2a/reply-data";
import {
  BY_LESSON,
  committed,
  LESSON_COPY_STORE,
  openDB,
  promisify,
} from "@/lib/idb";
import type { TopicRef } from "@/lib/learner-record";

// The lesson view's card as the server last gave it, to open offline.

/** A copy and the record's id for the lesson it holds; null when not known. */
export interface CopiedLesson extends TopicRef {
  lessonId: string | null;
}

interface LessonCopy extends TopicRef {
  card: TutorCard;
  savedAt: number;
  // Missing on copies kept before copies named their lesson.
  lessonId?: string | null;
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
  lessonId: string | null,
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
    lessonId,
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

/** Each copy's lessonId by its key, read from the index: the cards stay unread. */
function lessonIds(index: IDBIndex): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const ids = new Map<string, string>();
    const request = index.openKeyCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(ids);
      ids.set(JSON.stringify(cursor.primaryKey), cursor.key as string);
      cursor.continue();
    };
  });
}

export async function copiedLessons(): Promise<CopiedLesson[]> {
  const db = await openDB();
  const store = db
    .transaction(LESSON_COPY_STORE, "readonly")
    .objectStore(LESSON_COPY_STORE);
  const [keys, ids] = await Promise.all([
    promisify(store.getAllKeys()),
    lessonIds(store.index(BY_LESSON)),
  ]);
  return keys.map((key) => {
    const [planId, subjectSlug, topicIndex, topic] = key as [
      string,
      string,
      number,
      string,
    ];
    const lessonId = ids.get(JSON.stringify(key)) ?? null;
    return { planId, subjectSlug, topicIndex, topic, lessonId };
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
