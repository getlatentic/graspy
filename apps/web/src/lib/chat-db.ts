import type { TutorCard } from "@/lib/a2a/reply-data";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import {
  BY_SCOPE,
  CHAT_STORE,
  THREAD_STORE,
  committed,
  openDB,
  promisify,
} from "@/lib/idb";
import { scopeKey, type ThreadScope } from "@/lib/thread-scope";

export { scopeKey, type ThreadScope };

export interface ChatThread {
  id: string;
  scope: ThreadScope;
  // The A2A contextId of the tutor's memory, set by its first reply.
  agentContextId?: string;
  // The learner's latest question.
  preview?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatLink {
  label: string;
  to: string;
}

export interface ChatMessageMetadata {
  followUps?: string[];
  card?: TutorCard;
  viewCalls?: AppCallRequest[];
  // Carried by a learner's message.
  appCalls?: AppCallRequest[];
  link?: ChatLink;
  // Still arriving, not yet stored.
  streaming?: boolean;
  stopped?: boolean;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  type: "system" | "status" | "complete" | "error" | "user";
  content: string;
  timestamp: number;
  // When a view last changed what the message shows; absent until one did.
  editedAt?: number;
  metadata?: ChatMessageMetadata;
  sender: "ai" | "user";
}

export type NewChatMessage = Omit<ChatMessage, "id" | "timestamp">;

// Kept beside what is shown: the scope a thread is found by, and whether the learner's
// other devices have yet to be sent it (lib/threads/thread-sync.ts).
export const UNSENT = 1;
export type StoredThread = ChatThread & { scopeKey: string; unsent?: 1 };
export type StoredMessage = ChatMessage & { unsent?: 1 };

export function storedThread(thread: ChatThread): StoredThread {
  return { ...thread, scopeKey: scopeKey(thread.scope), unsent: UNSENT };
}

export function shownThread({
  scopeKey: _key,
  unsent: _unsent,
  ...thread
}: StoredThread): ChatThread {
  return thread;
}

export function shownMessage({
  unsent: _unsent,
  ...message
}: StoredMessage): ChatMessage {
  return message;
}

/** In order of time, then id, so every device shows a conversation alike. */
export function inOrder(a: ChatMessage, b: ChatMessage): number {
  return a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export async function saveChatMessage(
  message: NewChatMessage,
): Promise<ChatMessage> {
  const db = await openDB();
  const store = db.transaction(CHAT_STORE, "readwrite").objectStore(CHAT_STORE);
  const saved: ChatMessage = {
    ...message,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    timestamp: Date.now(),
  };
  await promisify(store.put({ ...saved, unsent: UNSENT }));
  return saved;
}

export async function saveMessageMetadata(
  id: string,
  metadata: ChatMessage["metadata"],
  editedAt: number = Date.now(),
): Promise<void> {
  const db = await openDB();
  const store = db.transaction(CHAT_STORE, "readwrite").objectStore(CHAT_STORE);
  const stored = await promisify<StoredMessage | undefined>(store.get(id));
  if (stored) {
    await promisify(
      store.put({ ...stored, metadata, editedAt, unsent: UNSENT }),
    );
  }
}

export async function getThreadMessages(
  threadId: string,
): Promise<ChatMessage[]> {
  const db = await openDB();
  const index = db
    .transaction(CHAT_STORE, "readonly")
    .objectStore(CHAT_STORE)
    .index("threadId");
  const messages = await promisify<StoredMessage[]>(index.getAll(threadId));
  return messages.map(shownMessage).sort(inOrder);
}

export async function listThreads(): Promise<ChatThread[]> {
  const db = await openDB();
  const store = db
    .transaction(THREAD_STORE, "readonly")
    .objectStore(THREAD_STORE);
  const threads = await promisify<StoredThread[]>(store.getAll());
  return threads.map(shownThread).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveThread(thread: ChatThread): Promise<void> {
  const db = await openDB();
  const store = db
    .transaction(THREAD_STORE, "readwrite")
    .objectStore(THREAD_STORE);
  await promisify(store.put(storedThread(thread)));
}

/** The thread kept for the scope of `thread`, keeping `thread` when there is none: another
 * device's copy may have arrived since the caller last looked. */
export async function keepThreadFor(thread: ChatThread): Promise<ChatThread> {
  const db = await openDB();
  const tx = db.transaction(THREAD_STORE, "readwrite");
  const store = tx.objectStore(THREAD_STORE);
  const found = await promisify<StoredThread | undefined>(
    store.index(BY_SCOPE).get(scopeKey(thread.scope)),
  );
  const done = committed(tx);
  if (!found) store.put(storedThread(thread));
  await done;
  return found ? shownThread(found) : thread;
}
