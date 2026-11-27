import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { ChatLink, SignInOffer } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { useChatPlanEdits, type ActionOf } from "./use-chat-plan-edits";
import type { LearnerPlan } from "./use-learner-plan";
import { useDetailsChange } from "./use-details-change";
import { useSubjectChange } from "./use-subject-change";

export type PendingPlanChange =
  | { type: "change_subjects"; names: string[]; removed: string[] }
  | { type: "rebuild_plan" };

// A new kind of action cannot go unhandled.
type ActionHandlers = {
  [K in TutorAction["type"]]: (action: ActionOf<K>) => void | Promise<void>;
};

export type TutorActionDeps = Pick<
  LearnerPlan,
  "curriculum" | "applyCurriculum" | "regenerate"
> & {
  /** In the app's words: the model saying it changed something is no proof. */
  onDone: (message: string, link?: ChatLink, offer?: SignInOffer) => void;
  onFailure: (message: string) => void;
};

/** Destructive changes wait for the learner: the model saying they agreed is not agreement. */
export function useTutorActions(deps: TutorActionDeps) {
  const [pending, setPending] = useState<PendingPlanChange | null>(null);
  // Each action builds on the plan the one before it left, not on the plan of the render that
  // started the reply: a second write would otherwise undo the first.
  const latest = useRef(deps.curriculum);
  // The last plan the device kept, which a write that fails falls back to.
  const kept = useRef(deps.curriculum);
  useEffect(() => {
    latest.current = deps.curriculum;
    kept.current = deps.curriculum;
  }, [deps.curriculum]);
  const read = useCallback(() => latest.current, []);
  const { applyCurriculum: applyToPlan } = deps;
  const applyCurriculum = useCallback(
    async (next: CurriculumData) => {
      latest.current = next;
      try {
        await applyToPlan(next);
        kept.current = next;
      } catch (error) {
        // The plan was not kept, so the next action builds on the one that was, unless a
        // later write has been started since: that one has built on this.
        if (latest.current === next) latest.current = kept.current;
        throw error;
      }
    },
    [applyToPlan],
  );
  const edits = useChatPlanEdits({ ...deps, read, applyCurriculum });
  const subjects = useSubjectChange({
    ...deps,
    read,
    applyCurriculum,
    confirmDrop: setPending,
  });
  const { askToChange, setSubjects } = subjects;
  const keepDetails = useDetailsChange({ ...deps, read, applyCurriculum });

  const carryOut = useCallback(
    async (actions: readonly TutorAction[]) => {
      const handlers: ActionHandlers = {
        open_topic: edits.openTopic,
        open_subject: edits.openSubject,
        add_topic: edits.addTopic,
        add_paths: edits.addPaths,
        change_subjects: askToChange,
        rebuild_plan: () => setPending({ type: "rebuild_plan" }),
        set_details: keepDetails,
      };
      for (const action of actions) {
        const handle = handlers[action.type] as (
          action: TutorAction,
        ) => void | Promise<void>;
        await handle(action);
      }
    },
    [askToChange, edits, keepDetails],
  );

  const confirmPlanChange = useCallback(async () => {
    const change = pending;
    if (!change) return;
    setPending(null);
    if (change.type === "change_subjects") await setSubjects(change.names);
    else await edits.rebuild();
  }, [edits, pending, setSubjects]);

  const dismissPlanChange = useCallback(() => setPending(null), []);

  return {
    carryOut,
    pendingPlanChange: pending,
    confirmPlanChange,
    dismissPlanChange,
    isChangingPlan: subjects.changing,
  };
}
