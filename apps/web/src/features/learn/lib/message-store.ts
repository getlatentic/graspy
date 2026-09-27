import type { AppCallRequest } from "@/lib/a2a/request-data";
import {
  getThreadMessages,
  inOrder,
  saveChatMessage,
  saveMessageMetadata,
  type ChatMessage,
  type ChatMessageMetadata,
  type NewChatMessage,
} from "@/lib/chat-db";

export interface MessageStorage {
  load: (threadId: string) => Promise<ChatMessage[]>;
  save: (message: NewChatMessage) => Promise<ChatMessage>;
  saveMetadata: (
    id: string,
    metadata: ChatMessageMetadata,
    editedAt: number,
  ) => Promise<void>;
}

const IN_INDEXED_DB: MessageStorage = {
  load: getThreadMessages,
  save: saveChatMessage,
  saveMetadata: saveMessageMetadata,
};

const NONE: readonly ChatMessage[] = [];

const editOf = (message: ChatMessage) => message.editedAt ?? message.timestamp;

// Listeners are per conversation so a streaming answer re-renders only its own
// view; lists are replaced, never mutated, so unchanged ones keep identity.
export class MessageStore {
  private readonly threads = new Map<string, readonly ChatMessage[]>();
  private readonly threadOf = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly loaded = new Set<string>();
  private readonly read = new Set<string>();

  private readonly storage: MessageStorage;

  constructor(storage: MessageStorage = IN_INDEXED_DB) {
    this.storage = storage;
  }

  messagesOf = (threadId: string): readonly ChatMessage[] =>
    this.threads.get(threadId) ?? NONE;

  subscribe = (threadId: string, listener: () => void): (() => void) => {
    const listening = this.listeners.get(threadId) ?? new Set();
    listening.add(listener);
    this.listeners.set(threadId, listening);
    return () => listening.delete(listener);
  };

  /** Until read, an empty conversation may not really be empty. */
  isRead = (threadId: string): boolean => this.read.has(threadId);

  loadThread = async (threadId: string): Promise<void> => {
    if (this.loaded.has(threadId)) return;
    this.loaded.add(threadId);
    let stored: ChatMessage[] = [];
    try {
      stored = await this.storage.load(threadId);
    } finally {
      this.read.add(threadId);
      const shown = this.messagesOf(threadId);
      const known = new Set(shown.map((message) => message.id));
      this.write(threadId, [
        ...shown,
        ...stored.filter((message) => !known.has(message.id)),
      ]);
    }
  };

  /** Reads a loaded conversation again after another device's messages were taken in. A
   * message changed here since storage last had it stays as shown, as do those never stored:
   * one still arriving, a failure. */
  refreshThread = async (threadId: string): Promise<void> => {
    if (!this.loaded.has(threadId)) return;
    const stored = await this.storage.load(threadId);
    const shown = new Map(
      this.messagesOf(threadId).map((message) => [message.id, message]),
    );
    const read = stored.map((message) => {
      const own = shown.get(message.id);
      shown.delete(message.id);
      return own && editOf(own) > editOf(message) ? own : message;
    });
    this.write(threadId, [...read, ...shown.values()]);
  };

  addMessage = async (
    message: NewChatMessage,
    { persist = true }: { persist?: boolean } = {},
  ): Promise<ChatMessage> => {
    const shown = persist
      ? await this.storage.save(message)
      : {
          ...message,
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
        };
    this.write(shown.threadId, [...this.messagesOf(shown.threadId), shown]);
    return shown;
  };

  updateMessage = (id: string, updates: Partial<ChatMessage>): void => {
    this.change(id, (message) => ({
      ...message,
      ...updates,
      metadata: updates.metadata
        ? { ...message.metadata, ...updates.metadata }
        : message.metadata,
    }));
  };

  replaceMessage = (temporaryId: string, stored: ChatMessage): void => {
    const threadId = this.threadOf.get(temporaryId) ?? stored.threadId;
    this.threadOf.delete(temporaryId);
    this.write(threadId, [
      ...this.messagesOf(threadId).filter((m) => m.id !== temporaryId),
      stored,
    ]);
  };

  keepViewCalls = (id: string, viewCalls: AppCallRequest[]): void => {
    this.change(id, (message) => {
      const merged = { ...message.metadata, viewCalls };
      const editedAt = Date.now();
      void this.storage
        .saveMetadata(id, merged, editedAt)
        .catch((error) => console.error("Failed to save the message:", error));
      return { ...message, metadata: merged, editedAt };
    });
  };

  private change(id: string, edit: (message: ChatMessage) => ChatMessage) {
    const threadId = this.threadOf.get(id);
    if (!threadId) return;
    this.write(
      threadId,
      this.messagesOf(threadId).map((message) =>
        message.id === id ? edit(message) : message,
      ),
    );
  }

  private write(threadId: string, messages: ChatMessage[]): void {
    const sorted = messages.sort(inOrder);
    for (const message of sorted) this.threadOf.set(message.id, threadId);
    this.threads.set(threadId, sorted);
    for (const listener of this.listeners.get(threadId) ?? []) listener();
  }
}
