import { useCallback, useMemo, useRef, useState } from "react";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { ChatLink, ChatThread } from "@/lib/chat-db";
import type { MessageStore } from "../lib/message-store";
import { useTutorActions, type TutorActionDeps } from "./use-tutor-actions";

type PlanChangeDeps = Omit<TutorActionDeps, "onDone" | "onFailure"> & {
  addMessage: MessageStore["addMessage"];
};

export function usePlanChanges({ addMessage, ...deps }: PlanChangeDeps) {
  const reportToRef = useRef<string | null>(null);
  const report = useCallback(
    (type: "complete" | "error") => (content: string, link?: ChatLink) => {
      const threadId = reportToRef.current;
      if (!threadId) return;
      void addMessage(
        {
          threadId,
          type,
          content,
          sender: "ai",
          metadata: link ? { link } : undefined,
        },
        { persist: type !== "error" },
      );
    },
    [addMessage],
  );
  const onDone = useMemo(() => report("complete"), [report]);
  const onFailure = useMemo(() => report("error"), [report]);
  const actions = useTutorActions({ ...deps, onDone, onFailure });
  const [threadId, setThreadId] = useState<string | null>(null);

  const { confirmPlanChange } = actions;
  const confirm = useCallback(async () => {
    reportToRef.current = threadId;
    await confirmPlanChange();
  }, [confirmPlanChange, threadId]);

  const { carryOut: carryOutAction } = actions;
  const carryOut = useCallback(
    async (actions: readonly TutorAction[], thread: ChatThread) => {
      reportToRef.current = thread.id;
      setThreadId(thread.id);
      await carryOutAction(actions);
    },
    [carryOutAction],
  );

  const { pendingPlanChange, dismissPlanChange, retryPath, isChangingPlan } =
    actions;
  const planChange = useMemo(
    () => ({
      pendingPlanChange,
      planChangeThreadId: threadId,
      confirmPlanChange: confirm,
      dismissPlanChange,
      retryPath,
      isChangingPlan,
    }),
    [
      pendingPlanChange,
      threadId,
      confirm,
      dismissPlanChange,
      retryPath,
      isChangingPlan,
    ],
  );
  return { carryOut, planChange };
}
