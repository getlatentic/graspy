import {
  scopeKey,
  shownMessage,
  shownThread,
  type ChatThread,
  type StoredMessage,
  type StoredThread,
} from "@/lib/chat-db";
import {
  BY_SCOPE,
  BY_UNSENT,
  CHAT_STORE,
  THREAD_STORE,
  committed,
  openDB,
  promisify,
} from "@/lib/idb";
import {
  editedAt,
  isSent,
  type ReadMessage,
  type ReadThread,
} from "./thread-wire";

// What the device keeps of its learner's conversations for their other devices: what it has
// yet to send, marked sent once the server has it, and what the server sent it, taken in
// beside the device's own. Every device finds a conversation by its scope; each keeps its
// own id for its copy.

export interface Unsent {
  thread: ChatThread;
  messages: StoredMessage[];
}

/** Only what can be sent: a message whose thread is gone has no scope to go under. */
export async function unsentThreads(): Promise<Unsent[]> {
  const db = await openDB();
  const tx = db.transaction([THREAD_STORE, CHAT_STORE], "readonly");
  const [threads, messages] = await Promise.all([
    promisify<StoredThread[]>(tx.objectStore(THREAD_STORE).getAll()),
    promisify<StoredMessage[]>(
      tx.objectStore(CHAT_STORE).index(BY_UNSENT).getAll(),
    ),
  ]);
  const withMessages = new Set(messages.map((message) => message.threadId));
  return threads
    .filter(
      (thread) =>
        thread.scopeKey && (thread.unsent || withMessages.has(thread.id)),
    )
    .map((thread) => ({
      thread: shownThread(thread),
      messages: messages.filter(
        (message) => message.threadId === thread.id && isSent(message),
      ),
    }));
}

const sameThread = (a: ChatThread, b: ChatThread) =>
  a.updatedAt === b.updatedAt &&
  a.agentContextId === b.agentContextId &&
  a.preview === b.preview;

/** Unmarked only as they were sent: one changed since goes with the next send. */
export async function markSent(sent: Unsent[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([THREAD_STORE, CHAT_STORE], "readwrite");
  const done = committed(tx);
  const threads = tx.objectStore(THREAD_STORE);
  const messages = tx.objectStore(CHAT_STORE);
  for (const { thread, messages: sentMessages } of sent) {
    unmarkIf<StoredThread>(threads, thread.id, (kept) =>
      sameThread(kept, thread),
    );
    for (const message of sentMessages) {
      unmarkIf<StoredMessage>(
        messages,
        message.id,
        (kept) => editedAt(kept) === editedAt(message),
      );
    }
  }
  await done;
}

function unmarkIf<T extends { unsent?: 1 }>(
  store: IDBObjectStore,
  key: string,
  still: (kept: T) => boolean,
): void {
  const request = store.get(key);
  request.onsuccess = () => {
    const kept = request.result as T | undefined;
    if (!kept?.unsent || !still(kept)) return;
    const { unsent: _unsent, ...rest } = kept;
    store.put(rest);
  };
}

/** The later question is the preview, and the context the server holds is every device's. */
function joined(own: StoredThread | undefined, read: ReadThread): StoredThread {
  const { messages: _messages, ...thread } = read;
  if (!own) return { ...thread, scopeKey: scopeKey(read.scope) };
  const later = read.updatedAt > own.updatedAt;
  return {
    ...own,
    agentContextId: read.agentContextId ?? own.agentContextId,
    preview: later ? (read.preview ?? own.preview) : own.preview,
    createdAt: Math.min(own.createdAt, read.createdAt),
    updatedAt: Math.max(own.updatedAt, read.updatedAt),
  };
}

const unchanged = (a: StoredThread, b: StoredThread) =>
  sameThread(a, b) && a.createdAt === b.createdAt && a.id === b.id;

/** A message kept here changes only for a later edit; an equal one is what the server has. */
function takenMessage(
  own: StoredMessage | undefined,
  read: ReadMessage,
  threadId: string,
): StoredMessage | null {
  if (!own) return { ...read, threadId };
  if (read.editedAt > editedAt(own)) {
    return { ...shownMessage(own), ...read, threadId: own.threadId };
  }
  if (read.editedAt === editedAt(own) && own.unsent) return shownMessage(own);
  return null;
}

function takeInThread(
  threads: IDBObjectStore,
  messages: IDBObjectStore,
  read: ReadThread,
  changed: Set<string>,
): void {
  const found = threads.index(BY_SCOPE).get(scopeKey(read.scope));
  found.onsuccess = () => {
    const own = found.result as StoredThread | undefined;
    const thread = joined(own, read);
    if (!own || !unchanged(own, thread)) {
      threads.put(thread);
      changed.add(thread.id);
    }
    for (const message of read.messages) {
      const kept = messages.get(message.id);
      kept.onsuccess = () => {
        const taken = takenMessage(kept.result, message, thread.id);
        if (!taken) return;
        messages.put(taken);
        changed.add(taken.threadId);
      };
    }
  };
}

/** Takes in one page the server sent, in one transaction; the threads it changed here. The
 * caller has checked that the device still learns as the learner the page is for. */
export async function takeIn(
  read: readonly ReadThread[],
): Promise<Set<string>> {
  const changed = new Set<string>();
  if (read.length === 0) return changed;
  const db = await openDB();
  const tx = db.transaction([THREAD_STORE, CHAT_STORE], "readwrite");
  const done = committed(tx);
  const threads = tx.objectStore(THREAD_STORE);
  const messages = tx.objectStore(CHAT_STORE);
  for (const thread of read) takeInThread(threads, messages, thread, changed);
  await done;
  return changed;
}
