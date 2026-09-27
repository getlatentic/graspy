import {
  currentPlan,
  forgetLocal,
  messageForSending,
  threadForSending,
  localEntries,
  messageInCurrentShape,
  messageWithQuestionSet,
  messageWithViewCard,
  practiceRecordOfMessage,
  readLocalLearning,
} from "./db-upgrades";

const DB_NAME = "graspy-db";
// 2: chats are kept per thread.
// 3: lessons and progress are kept per plan, moved from localStorage.
// 4: the plan is rewritten in its current shape, once, not on every read.
// 5: practice cards and answers take MCP Apps' shape; the practice record.
// 6: a card is the tool call and result its view is sent.
// 7: practice comes in sets; the practice record is kept per question.
// 8: lesson copies for offline, and an outbox for the views' offline calls.
// 9: spoken answers to voice lessons, kept until the server has them.
// 10: lesson copies indexed by the lesson each holds, to list without cards.
// 11: threads found by scope; threads and messages marked until the server has them.
// A shipped upgrade is never changed: a new rewrite, or a new lesson format
// (which must clear the lesson store), is a new version.
const DB_VERSION = 11;

export const CURRICULUM_STORE = "curriculum";
export const CHAT_STORE = "chat-history";
export const THREAD_STORE = "chat-threads";
export const LESSON_STORE = "lessons";
export const PROGRESS_STORE = "progress";
export const PRACTICE_STORE = "practice";
const PRACTICE_KEY = ["messageId", "question"];
export const LESSON_COPY_STORE = "lesson-copies";
export const BY_LESSON = "lessonId";
export const OUTBOX_STORE = "outbox";
export const VOICE_ANSWER_STORE = "voice-answers";
export const BY_SCOPE = "scopeKey";
export const BY_UNSENT = "unsent";
// Rewrites an upgrade leaves for after it has committed.
const PENDING_STORE = "pending";
const MARK_UNSENT = "mark-unsent";

// Title included: a position whose topic changed is a different topic.
const TOPIC_KEY = ["planId", "subjectSlug", "topicIndex", "topic"];
const BY_PLAN = "plan";
const BY_SUBJECT = "subject";

// Before version 2 one conversation mixed every subject: kept to read only.
const EARLIER_THREAD_ID = "earlier";

// An aborted transaction (quota, a closed handle) never fires the request's
// own callbacks.
export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    const tx = request.transaction;
    if (tx) {
      tx.onabort = () => reject(tx.error ?? new Error("Storage write aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("Storage write failed"));
    }
  });
}

// One connection for the tab's lifetime: a leaked per-operation handle
// blocks the next open, and the write then never settles.
let connection: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    const forget = () => {
      connection = null;
    };

    request.onerror = () => {
      forget();
      reject(request.error);
    };

    request.onblocked = () => {
      forget();
      reject(
        new Error("Storage is open in another tab and blocked an upgrade"),
      );
    };

    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading needs this handle out of the way, and a handle
      // closed underneath us must not be handed out again.
      db.onversionchange = () => {
        db.close();
        forget();
      };
      db.onclose = forget;
      finishPending(db).then(
        () => resolve(db),
        (error: unknown) => {
          forget();
          db.close();
          reject(error);
        },
      );
    };

    request.onupgradeneeded = (event) => {
      const tx = request.transaction;
      if (!tx) return;
      for (const [version, step] of UPGRADES) {
        if (event.oldVersion < version)
          step(request.result, tx, event.oldVersion);
      }
    };
  });

  return connection;
}

type Upgrade = (db: IDBDatabase, tx: IDBTransaction, from: number) => void;

const UPGRADES: [version: number, step: Upgrade][] = [
  [1, (db) => createFirstStores(db)],
  [2, (db, tx) => keepChatsByThread(db, tx)],
  [
    3,
    (db, tx) => {
      keepLearningByPlan(db);
      moveLocalLearning(tx);
    },
  ],
  [4, (_db, tx) => rewritePlan(tx)],
  [5, (db) => keepPracticeRecord(db)],
  [7, (db, tx, from) => rewriteMessages(db, tx, from)],
  [8, (db) => keepForOffline(db)],
  [9, (db) => db.createObjectStore(VOICE_ANSWER_STORE, { keyPath: "key" })],
  [
    10,
    (_db, tx) =>
      tx.objectStore(LESSON_COPY_STORE).createIndex(BY_LESSON, "lessonId"),
  ],
  [11, (db, tx) => keepForSending(db, tx)],
];

// Everything kept so far is unsent: a device signed in sends it to its learner, and one
// signed out keeps it until it signs in. Marked once the upgrade has committed: a cursor
// here would read messages before earlier steps' cursors had rewritten them.
function keepForSending(db: IDBDatabase, tx: IDBTransaction): void {
  tx.objectStore(THREAD_STORE).createIndex(BY_SCOPE, BY_SCOPE);
  tx.objectStore(CHAT_STORE).createIndex(BY_UNSENT, BY_UNSENT);
  db.createObjectStore(PENDING_STORE, { keyPath: "id" }).put({
    id: MARK_UNSENT,
  });
}

// In one transaction with the pending mark, so a rewrite cut short runs again on the next
// open.
async function finishPending(db: IDBDatabase): Promise<void> {
  const pending = db
    .transaction(PENDING_STORE, "readonly")
    .objectStore(PENDING_STORE);
  if (!(await promisify(pending.get(MARK_UNSENT)))) return;
  const tx = db.transaction(
    [PENDING_STORE, THREAD_STORE, CHAT_STORE],
    "readwrite",
  );
  const done = committed(tx);
  const mark = tx.objectStore(PENDING_STORE).get(MARK_UNSENT);
  mark.onsuccess = () => {
    if (!mark.result) return;
    rewriteEach(tx.objectStore(THREAD_STORE), threadForSending);
    rewriteEach(tx.objectStore(CHAT_STORE), messageForSending);
    tx.objectStore(PENDING_STORE).delete(MARK_UNSENT);
  };
  await done;
}

function rewriteEach(
  store: IDBObjectStore,
  step: (value: object) => object,
): void {
  const cursor = store.openCursor();
  cursor.onsuccess = () => {
    const found = cursor.result;
    if (!found) return;
    const rewritten = step(found.value);
    if (rewritten !== found.value) found.update(rewritten);
    found.continue();
  };
}

function keepForOffline(db: IDBDatabase): void {
  db.createObjectStore(LESSON_COPY_STORE, { keyPath: TOPIC_KEY });
  db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
}

function createFirstStores(db: IDBDatabase): void {
  db.createObjectStore(CURRICULUM_STORE, { keyPath: "id" });
  const chat = db.createObjectStore(CHAT_STORE, { keyPath: "id" });
  chat.createIndex("timestamp", "timestamp", { unique: false });
}

function keepChatsByThread(db: IDBDatabase, tx: IDBTransaction): void {
  const threads = db.createObjectStore(THREAD_STORE, { keyPath: "id" });
  const chat = tx.objectStore(CHAT_STORE);
  chat.createIndex("threadId", "threadId", { unique: false });

  let first = Infinity;
  let last = 0;
  const cursor = chat.openCursor();
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (current) {
      const message = current.value;
      first = Math.min(first, message.timestamp);
      last = Math.max(last, message.timestamp);
      current.update({ ...message, threadId: EARLIER_THREAD_ID });
      current.continue();
      return;
    }
    if (last > 0) {
      threads.put({
        id: EARLIER_THREAD_ID,
        scope: { kind: "earlier" },
        createdAt: first,
        updatedAt: last,
      });
    }
  };
}

function indexByPlan(store: IDBObjectStore): void {
  store.createIndex(BY_PLAN, "planId", { unique: false });
  store.createIndex(BY_SUBJECT, ["planId", "subjectSlug"], { unique: false });
}

function keepLearningByPlan(db: IDBDatabase): void {
  for (const name of [LESSON_STORE, PROGRESS_STORE]) {
    const store = db.createObjectStore(name, { keyPath: TOPIC_KEY });
    indexByPlan(store);
  }
}

// Keys go only once the upgrade commits, so a failed upgrade loses nothing.
function moveLocalLearning(tx: IDBTransaction): void {
  const request = tx.objectStore(CURRICULUM_STORE).get("current");
  request.onsuccess = () => {
    const plan = currentPlan(request.result ?? null);
    const found = readLocalLearning(plan, localEntries());
    for (const lesson of found.lessons)
      tx.objectStore(LESSON_STORE).put(lesson);
    for (const topic of found.learnt) tx.objectStore(PROGRESS_STORE).put(topic);
    tx.addEventListener("complete", () => forgetLocal(found.keys));
  };
}

function rewritePlan(tx: IDBTransaction): void {
  const plans = tx.objectStore(CURRICULUM_STORE);
  const request = plans.get("current");
  request.onsuccess = () => {
    const plan = currentPlan(request.result ?? null);
    if (plan) plans.put(plan);
  };
}

function keepPracticeRecord(db: IDBDatabase): void {
  const store = db.createObjectStore(PRACTICE_STORE, { keyPath: "messageId" });
  indexByPlan(store);
}

function rewriteMessages(
  db: IDBDatabase,
  tx: IDBTransaction,
  oldVersion: number,
): void {
  const threads = tx.objectStore(THREAD_STORE).getAll();
  threads.onsuccess = () => {
    const scopes = new Map(
      threads.result.map((thread) => [thread.id, thread.scope]),
    );
    const cursor = tx.objectStore(CHAT_STORE).openCursor();
    cursor.onsuccess = () => {
      const found = cursor.result;
      if (!found) {
        rekeyPractice(db, tx);
        return;
      }
      let message = found.value;
      if (oldVersion < 5) {
        message = messageInCurrentShape(message);
        const record = practiceRecordOfMessage(
          message,
          scopes.get(message.threadId),
        );
        if (record) tx.objectStore(PRACTICE_STORE).put(record);
      }
      if (oldVersion < 6) message = messageWithViewCard(message);
      message = messageWithQuestionSet(message);
      if (message !== found.value) found.update(message);
      found.continue();
    };
  };
}

function rekeyPractice(db: IDBDatabase, tx: IDBTransaction): void {
  const kept = tx.objectStore(PRACTICE_STORE).getAll();
  kept.onsuccess = () => {
    db.deleteObjectStore(PRACTICE_STORE);
    const store = db.createObjectStore(PRACTICE_STORE, {
      keyPath: PRACTICE_KEY,
    });
    indexByPlan(store);
    for (const record of kept.result) store.put(record);
  };
}

export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Storage write aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Storage write failed"));
  });
}
