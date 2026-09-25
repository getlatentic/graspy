import { useCallback, useState } from "react";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { ChatLink } from "@/lib/chat-db";
import { useChatPlanEdits, type ActionOf } from "./use-chat-plan-edits";
import type { LearnerPlan } from "./use-learner-plan";
import { usePathProposal, type PathProposal } from "./use-path-proposal";
import { useSubjectChange } from "./use-subject-change";

export type PendingPlanChange =
  | { type: "change_subjects"; names: string[]; removed: string[] }
  | { type: "rebuild_plan" }
  | PathProposal;

// A new kind of action cannot go unhandled.
type ActionHandlers = {
  [K in TutorAction["type"]]: (action: ActionOf<K>) => void | Promise<void>;
};

export type TutorActionDeps = Pick<
  LearnerPlan,
  "curriculum" | "applyCurriculum" | "regenerate"
> & {
  /** In the app's words: the model saying it changed something is no proof. */
  onDone: (message: string, link?: ChatLink) => void;
  onFailure: (message: string) => void;
};

/** Destructive changes wait for the learner: the model saying they agreed is not agreement. */
export function useTutorActions(deps: TutorActionDeps) {
  const [pending, setPending] = useState<PendingPlanChange | null>(null);
  const edits = useChatPlanEdits(deps);
  const subjects = useSubjectChange({ ...deps, confirmDrop: setPending });
  const { propose, forget } = usePathProposal(deps.curriculum, setPending);
  const { askToChange, setSubjects } = subjects;

  const carryOut = useCallback(
    async (action: TutorAction) => {
      const handlers: ActionHandlers = {
        open_topic: edits.openTopic,
        open_subject: edits.openSubject,
        add_topic: edits.addTopic,
        change_subjects: askToChange,
        rebuild_plan: () => setPending({ type: "rebuild_plan" }),
        propose_path: ({ goal }) => propose(goal),
      };
      const handle = handlers[action.type] as (
        action: TutorAction,
      ) => void | Promise<void>;
      await handle(action);
    },
    [askToChange, edits, propose],
  );

  const confirmPlanChange = useCallback(async () => {
    const change = pending;
    if (!change || (change.type === "propose_path" && !change.path)) return;
    setPending(null);
    if (change.type === "change_subjects") await setSubjects(change.names);
    else if (change.type === "rebuild_plan") await edits.rebuild();
    else if (change.path) await edits.acceptPath(change.path);
  }, [edits, pending, setSubjects]);

  const dismissPlanChange = useCallback(() => {
    forget();
    setPending(null);
  }, [forget]);

  return {
    carryOut,
    pendingPlanChange: pending,
    confirmPlanChange,
    dismissPlanChange,
    isChangingPlan: subjects.changing,
  };
}
