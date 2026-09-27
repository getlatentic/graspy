import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreadScope } from "@/lib/chat-db";
import { onThreadsTakenIn } from "@/lib/threads/thread-sync";
import { scopeContext } from "../lib/tutor-context";
import { MessageStore } from "../lib/message-store";
import type { LearnerPlan } from "./use-learner-plan";
import { useChatThreads } from "./use-chat-threads";
import { usePlanChanges } from "./use-plan-changes";
import { useThreadSync } from "./use-thread-sync";
import { useTutorTurn } from "./use-tutor-turn";
import { useUnread } from "./use-unread";

type PlanDeps = Pick<
  LearnerPlan,
  "curriculum" | "applyCurriculum" | "regenerate"
>;

export function useTutorChat({ curriculum, ...plan }: PlanDeps) {
  const [store] = useState(() => new MessageStore());
  const { threads, threadsLoaded, threadFor, ensureThread, recordTurn } =
    useChatThreads();
  const { carryOut, planChange } = usePlanChanges({
    ...plan,
    curriculum,
    addMessage: store.addMessage,
  });
  const turn = useTutorTurn(
    useMemo(
      () => ({
        store,
        ensureThread,
        recordTurn,
        learnerFor: async (scope: ThreadScope) =>
          scopeContext(curriculum, scope),
        carryOut,
      }),
      [carryOut, curriculum, ensureThread, recordTurn, store],
    ),
  );
  const { unread, setViewing } = useUnread(turn.busyThreadId);
  const sync = useThreadSync();

  useEffect(
    () =>
      onThreadsTakenIn((threadIds) => {
        for (const id of threadIds) {
          store
            .refreshThread(id)
            .catch((error) => console.error("Failed to load chats:", error));
        }
      }),
    [store],
  );

  // The learner's other devices see each turn once it is answered.
  const { send: ask } = turn;
  const send = useCallback(
    async (...args: Parameters<typeof ask>) => {
      await ask(...args);
      sync();
    },
    [ask, sync],
  );

  // Messages stay out: streaming would re-render every chat reader.
  return useMemo(
    () => ({
      messageStore: store,
      keepViewCalls: store.keepViewCalls,
      threads,
      threadsLoaded,
      threadFor,
      ...turn,
      send,
      ...planChange,
      unread,
      setViewing,
    }),
    [
      store,
      threads,
      threadsLoaded,
      threadFor,
      turn,
      send,
      planChange,
      unread,
      setViewing,
    ],
  );
}

export type TutorChat = ReturnType<typeof useTutorChat>;
