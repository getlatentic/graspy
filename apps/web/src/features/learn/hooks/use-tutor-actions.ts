import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { ChatLink } from "@/lib/chat-db";
import type { LearningPath } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";
import { useChatPlanEdits, type ActionOf } from "./use-chat-plan-edits";
import type { LearnerPlan } from "./use-learner-plan";
import { usePathProposal, type PathProposals } from "./use-path-proposal";
import { useSubjectChange } from "./use-subject-change";

export type PendingPlanChange =
  | { type: "change_subjects"; names: string[]; removed: string[] }
  | { type: "rebuild_plan" }
  | PathProposals;

// A new kind of action cannot go unhandled. The courses of one reply are proposed together.
type ActionHandlers = {
  [K in Exclude<TutorAction["type"], "propose_path">]: (
    action: ActionOf<K>,
  ) => void | Promise<void>;
};

export type TutorActionDeps = Pick<
  LearnerPlan,
  "curriculum" | "applyCurriculum" | "regenerate"
> & {
  /** In the app's words: the model saying it changed something is no proof. */
  onDone: (message: string, link?: ChatLink) => void;
  onFailure: (message: string) => void;
};

/** A change that clears progress waits for the learner, and is shown before any proposed course. */
function asksForConfirmation(action: TutorAction): boolean {
  return (
    action.type === "rebuild_plan" ||
    (action.type === "change_subjects" && action.remove.length > 0)
  );
}

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
  const { propose, retry, takeReady, putBack, forget } = usePathProposal(
    deps.curriculum,
    setPending,
  );
  // Whatever takes the card's place ends the round of plans still arriving for it.
  const replaceCard = useCallback(
    (change: Exclude<PendingPlanChange, PathProposals>) => {
      forget();
      setPending(change);
    },
    [forget],
  );
  const subjects = useSubjectChange({
    ...deps,
    read,
    applyCurriculum,
    confirmDrop: replaceCard,
  });
  const { askToChange, setSubjects } = subjects;

  const carryOut = useCallback(
    async (actions: readonly TutorAction[]) => {
      const handlers: ActionHandlers = {
        open_topic: edits.openTopic,
        open_subject: edits.openSubject,
        add_topic: edits.addTopic,
        change_subjects: askToChange,
        rebuild_plan: () => replaceCard({ type: "rebuild_plan" }),
      };
      const goals: string[] = [];
      for (const action of actions) {
        if (action.type === "propose_path") {
          goals.push(action.goal);
          continue;
        }
        const handle = handlers[action.type] as (
          action: TutorAction,
        ) => void | Promise<void>;
        await handle(action);
      }
      if (goals.length > 0 && !actions.some(asksForConfirmation)) {
        await propose(goals);
      }
    },
    [askToChange, edits, propose, replaceCard],
  );

  const confirmPlanChange = useCallback(async () => {
    const change = pending;
    if (!change) return;
    if (change.type === "propose_path") {
      // The courses not ready stay on the card, and so do those the plan had no room for.
      const { taken, remaining, round } = takeReady();
      if (taken.length === 0) return;
      if (remaining === 0) setPending(null);
      let unfit: LearningPath[];
      try {
        unfit = await edits.acceptPaths(
          taken.flatMap(({ path }) => path ?? []),
        );
      } catch (error) {
        putBack(taken, round);
        throw error;
      }
      putBack(
        taken.filter(({ path }) => path && unfit.includes(path)),
        round,
      );
      return;
    }
    forget();
    setPending(null);
    if (change.type === "change_subjects") await setSubjects(change.names);
    else await edits.rebuild();
  }, [edits, forget, pending, putBack, setSubjects, takeReady]);

  const dismissPlanChange = useCallback(() => {
    forget();
    setPending(null);
  }, [forget]);

  return {
    carryOut,
    pendingPlanChange: pending,
    confirmPlanChange,
    dismissPlanChange,
    retryPath: retry,
    isChangingPlan: subjects.changing,
  };
}
