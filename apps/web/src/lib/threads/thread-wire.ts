// A learner's conversations as their devices share them (app/threads/wire.py on the server).
// The server exports the shape to thread-contract.json, which the tests hold this file to.
// What is read arrives from the network, so each field is checked before it is trusted.
import { isTutorCard } from "@/lib/a2a/reply-data";
import { isAppCall } from "@/lib/a2a/request-data";
import type {
  ChatMessage,
  ChatMessageMetadata,
  ChatThread,
  ThreadScope,
} from "@/lib/chat-db";
import { pathOf, targetOf } from "./chat-links";

export type WireType = "user" | "system" | "complete";

export interface WireMessage {
  id: string;
  type: WireType;
  content: string;
  timestamp: number;
  editedAt: number;
  metadata?: Record<string, unknown>;
}

export interface WireThread {
  id: string;
  scope: ThreadScope;
  agentContextId?: string;
  preview?: string;
  createdAt: number;
  updatedAt: number;
  messages: WireMessage[];
}

/** A message read from the server, not yet placed in this device's copy of its thread. */
export type ReadMessage = Omit<ChatMessage, "threadId"> & {
  type: WireType;
  editedAt: number;
};

export interface ReadThread extends ChatThread {
  messages: ReadMessage[];
}

export interface Changes {
  upTo: number;
  threads: ReadThread[];
  next: string | null;
}

const SENT_TYPES = new Set<string>(["user", "system", "complete"]);

export const isSent = (message: ChatMessage): boolean =>
  SENT_TYPES.has(message.type);

export const editedAt = (message: ChatMessage): number =>
  message.editedAt ?? message.timestamp;

function sentMetadata(
  metadata: ChatMessageMetadata | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const { streaming: _streaming, link, ...rest } = metadata;
  const to = link && targetOf(link.to);
  const sent = {
    ...rest,
    ...(link && to ? { link: { label: link.label, to } } : {}),
  };
  return Object.keys(sent).length > 0 ? sent : undefined;
}

export function sentMessage(message: ChatMessage): WireMessage {
  const metadata = sentMetadata(message.metadata);
  return {
    id: message.id,
    type: message.type as WireType,
    content: message.content,
    timestamp: message.timestamp,
    editedAt: editedAt(message),
    ...(metadata ? { metadata } : {}),
  };
}

export function sentThread(
  thread: ChatThread,
  messages: readonly ChatMessage[],
): WireThread {
  return {
    id: thread.id,
    scope: thread.scope,
    ...(thread.agentContextId ? { agentContextId: thread.agentContextId } : {}),
    ...(thread.preview ? { preview: thread.preview } : {}),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: messages.filter(isSent).map(sentMessage),
  };
}

const isText = (value: unknown): value is string => typeof value === "string";
const isTime = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const texts = (value: unknown) =>
  Array.isArray(value) ? value.filter(isText) : [];
const calls = (value: unknown) =>
  Array.isArray(value) ? value.filter(isAppCall) : [];

function readScope(value: unknown): ThreadScope | null {
  if (!isRecord(value)) return null;
  const { kind, planId, subjectSlug, topic } = value;
  if (kind === "earlier") return { kind };
  if (!isText(planId)) return null;
  if (kind === "general") return { kind, planId };
  if (!isText(subjectSlug)) return null;
  if (kind === "subject") return { kind, planId, subjectSlug };
  return kind === "topic" && isText(topic)
    ? { kind, planId, subjectSlug, topic }
    : null;
}

function readLink(value: unknown): ChatMessageMetadata["link"] {
  if (!isRecord(value) || !isText(value.label)) return undefined;
  const to = pathOf(value.to);
  return to ? { label: value.label, to } : undefined;
}

/** Field by field: a part this app cannot read costs that part, not the message. */
function readMetadata(value: unknown): ChatMessageMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const link = readLink(value.link);
  const read: ChatMessageMetadata = {
    ...(texts(value.followUps).length
      ? { followUps: texts(value.followUps) }
      : {}),
    ...(isTutorCard(value.card) ? { card: value.card } : {}),
    ...(calls(value.viewCalls).length
      ? { viewCalls: calls(value.viewCalls) }
      : {}),
    ...(calls(value.appCalls).length
      ? { appCalls: calls(value.appCalls) }
      : {}),
    ...(link ? { link } : {}),
    ...(value.stopped === true ? { stopped: true } : {}),
  };
  return Object.keys(read).length > 0 ? read : undefined;
}

function readMessage(value: unknown): ReadMessage | null {
  if (!isRecord(value)) return null;
  const { id, type, content, timestamp } = value;
  if (!isText(id) || !isText(type) || !SENT_TYPES.has(type)) return null;
  if (!isText(content) || !isTime(timestamp)) return null;
  const metadata = readMetadata(value.metadata);
  return {
    id,
    type: type as WireType,
    content,
    timestamp,
    editedAt: isTime(value.editedAt) ? value.editedAt : timestamp,
    sender: type === "user" ? "user" : "ai",
    ...(metadata ? { metadata } : {}),
  };
}

function readThread(value: unknown): ReadThread | null {
  if (!isRecord(value)) return null;
  const scope = readScope(value.scope);
  const { id, createdAt, updatedAt, agentContextId, preview } = value;
  if (!scope || !isText(id) || !isTime(createdAt) || !isTime(updatedAt)) {
    return null;
  }
  const messages = Array.isArray(value.messages) ? value.messages : [];
  return {
    id,
    scope,
    ...(isText(agentContextId) ? { agentContextId } : {}),
    ...(isText(preview) ? { preview } : {}),
    createdAt,
    updatedAt,
    messages: messages.map(readMessage).filter((m) => m !== null),
  };
}

/** Throws when the page itself is not one the server sends. */
export function readChanges(value: unknown): Changes {
  if (
    !isRecord(value) ||
    !isTime(value.upTo) ||
    !Array.isArray(value.threads)
  ) {
    throw new Error("The server's changes are unreadable");
  }
  return {
    upTo: value.upTo,
    threads: value.threads.map(readThread).filter((t) => t !== null),
    next: isText(value.next) ? value.next : null,
  };
}
