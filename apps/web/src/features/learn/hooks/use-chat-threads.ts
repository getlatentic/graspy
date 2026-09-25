import { useCallback, useEffect, useRef, useState } from "react";
import {
  listThreads,
  saveThread,
  scopeKey,
  type ChatThread,
  type ThreadScope,
} from "@/lib/chat-db";

const findThread = (threads: ChatThread[], scope: ThreadScope) => {
  const key = scopeKey(scope);
  return threads.find((thread) => scopeKey(thread.scope) === key) ?? null;
};

function newThread(scope: ThreadScope): ChatThread {
  const now = Date.now();
  return {
    id: `thread-${crypto.randomUUID()}`,
    scope,
    createdAt: now,
    updatedAt: now,
  };
}

export function useChatThreads() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const threadsRef = useRef<ChatThread[]>([]);

  const commit = useCallback((next: ChatThread[]) => {
    threadsRef.current = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    setThreads(threadsRef.current);
  }, []);

  useEffect(() => {
    listThreads()
      .then(commit)
      .catch((error) => console.error("Failed to load chats:", error))
      .finally(() => setThreadsLoaded(true));
  }, [commit]);

  const threadFor = useCallback(
    (scope: ThreadScope) => findThread(threads, scope),
    [threads],
  );

  // Called on the first question, so browsing leaves no empty threads.
  const ensureThread = useCallback(
    async (scope: ThreadScope) => {
      const existing = findThread(threadsRef.current, scope);
      if (existing) return existing;
      const thread = newThread(scope);
      commit([...threadsRef.current, thread]);
      await saveThread(thread);
      return thread;
    },
    [commit],
  );

  const recordTurn = useCallback(
    async (
      threadId: string,
      turn: { agentContextId?: string; question: string },
    ) => {
      const thread = threadsRef.current.find((t) => t.id === threadId);
      if (!thread) return;
      const updated: ChatThread = {
        ...thread,
        agentContextId: turn.agentContextId ?? thread.agentContextId,
        preview: turn.question,
        updatedAt: Date.now(),
      };
      commit(threadsRef.current.map((t) => (t.id === threadId ? updated : t)));
      await saveThread(updated);
    },
    [commit],
  );

  return { threads, threadsLoaded, threadFor, ensureThread, recordTurn };
}
