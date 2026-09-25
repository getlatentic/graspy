import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ChatMessage, ThreadScope } from "@/lib/chat-db";
import { useChat } from "../learner-context";

const NONE: readonly ChatMessage[] = [];

export function useConversation(scope: ThreadScope) {
  const { messageStore, threadFor, setViewing } = useChat();
  const threadId = threadFor(scope)?.id ?? null;
  const subscribe = useCallback(
    (listener: () => void) =>
      threadId ? messageStore.subscribe(threadId, listener) : () => {},
    [messageStore, threadId],
  );
  const read = useCallback(
    () => (threadId ? messageStore.messagesOf(threadId) : NONE),
    [messageStore, threadId],
  );
  const messages = useSyncExternalStore(subscribe, read);

  useEffect(() => {
    if (threadId) void messageStore.loadThread(threadId);
  }, [messageStore, threadId]);

  useEffect(() => {
    setViewing(threadId);
    return () => setViewing(null);
  }, [setViewing, threadId]);

  const conversation = useMemo(
    () => messages.filter((message) => message.type !== "status"),
    [messages],
  );
  const ready = threadId === null || messageStore.isRead(threadId);
  return { threadId, conversation, ready };
}
