import { useMemo, useState } from "react";
import type { ThreadScope } from "@/lib/chat-db";
import { scopeContext } from "../lib/tutor-context";
import { MessageStore } from "../lib/message-store";
import type { LearnerPlan } from "./use-learner-plan";
import { useChatThreads } from "./use-chat-threads";
import { usePlanChanges } from "./use-plan-changes";
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

  // Messages stay out: streaming would re-render every chat reader.
  return useMemo(
    () => ({
      messageStore: store,
      keepViewCalls: store.keepViewCalls,
      threads,
      threadsLoaded,
      threadFor,
      ...turn,
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
      planChange,
      unread,
      setViewing,
    ],
  );
}

export type TutorChat = ReturnType<typeof useTutorChat>;
