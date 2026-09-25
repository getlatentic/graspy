import type { TutorCard } from "@/lib/a2a/reply-data";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import { CHAT_STORE, THREAD_STORE, openDB, promisify } from "@/lib/idb";

// Fixed when a conversation starts; a rebuilt plan is a new conversation.
export type ThreadScope =
  | { kind: "topic"; planId: string; subjectSlug: string; topic: string }
  | { kind: "subject"; planId: string; subjectSlug: string }
  | { kind: "general"; planId: string }
  | { kind: "earlier" };

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
  metadata?: ChatMessageMetadata;
  sender: "ai" | "user";
}

export type NewChatMessage = Omit<ChatMessage, "id" | "timestamp">;

export function scopeKey(scope: ThreadScope): string {
  if (scope.kind === "topic") {
    return `topic\u0000${scope.planId}\u0000${scope.subjectSlug}\u0000${scope.topic}`;
  }
  if (scope.kind === "subject") {
    return `subject\u0000${scope.planId}\u0000${scope.subjectSlug}`;
  }
  return scope.kind === "general" ? `general\u0000${scope.planId}` : "earlier";
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
  await promisify(store.put(saved));
  return saved;
}

export async function saveMessageMetadata(
  id: string,
  metadata: ChatMessage["metadata"],
): Promise<void> {
  const db = await openDB();
  const store = db.transaction(CHAT_STORE, "readwrite").objectStore(CHAT_STORE);
  const stored = await promisify<ChatMessage | undefined>(store.get(id));
  if (stored) await promisify(store.put({ ...stored, metadata }));
}

export async function getThreadMessages(
  threadId: string,
): Promise<ChatMessage[]> {
  const db = await openDB();
  const index = db
    .transaction(CHAT_STORE, "readonly")
    .objectStore(CHAT_STORE)
    .index("threadId");
  const messages = await promisify<ChatMessage[]>(index.getAll(threadId));
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function listThreads(): Promise<ChatThread[]> {
  const db = await openDB();
  const store = db
    .transaction(THREAD_STORE, "readonly")
    .objectStore(THREAD_STORE);
  const threads = await promisify<ChatThread[]>(store.getAll());
  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveThread(thread: ChatThread): Promise<void> {
  const db = await openDB();
  const store = db
    .transaction(THREAD_STORE, "readwrite")
    .objectStore(THREAD_STORE);
  await promisify(store.put(thread));
}
