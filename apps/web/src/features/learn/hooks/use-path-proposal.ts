import { useCallback, useEffect, useRef } from "react";
import { planLearningPath, type LearningPath } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";

/** The server plans a path with a model; as long as the plan stream's own quiet limit. */
export const PATH_PLAN_TIMEOUT_MS = 60_000;

export interface PathProposal {
  goal: string;
  path: LearningPath | null;
  failed: boolean;
}

/** One proposal for each course the learner asked for, each its own subject if added. */
export interface PathProposals {
  type: "propose_path";
  proposals: PathProposal[];
}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Planning timed out")), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

const sameGoal = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * Rounds are numbered: whatever replaces, dismisses or accepts the proposals, or the screen
 * closing, ends the round, and a plan that arrives after it is ignored. Each plan has its own
 * time limit, so one slow course never holds the others.
 */
export function usePathProposal(
  curriculum: CurriculumData | null,
  show: (proposals: PathProposals) => void,
) {
  const round = useRef(0);
  const proposals = useRef<PathProposal[]>([]);
  useEffect(
    () => () => {
      round.current += 1;
    },
    [],
  );

  const publish = useCallback(() => {
    show({ type: "propose_path", proposals: [...proposals.current] });
  }, [show]);

  const plan = useCallback(
    async (goal: string, mine: number) => {
      if (!curriculum) return;
      let path: LearningPath | null = null;
      try {
        path = await within(
          planLearningPath({
            country: curriculum.country,
            language: curriculum.language,
            gradeLevel: curriculum.gradeLevel,
            goal,
          }),
          PATH_PLAN_TIMEOUT_MS,
        );
      } catch (error) {
        console.error("Planning a path failed:", error);
      }
      if (round.current !== mine) return;
      proposals.current = proposals.current.map((proposal) =>
        sameGoal(proposal.goal, goal)
          ? { goal: proposal.goal, path, failed: !path }
          : proposal,
      );
      publish();
    },
    [curriculum, publish],
  );

  const propose = useCallback(
    async (asked: string[]) => {
      if (!curriculum) return;
      const goals = asked.filter(
        (goal, at) => asked.findIndex((other) => sameGoal(other, goal)) === at,
      );
      const mine = ++round.current;
      proposals.current = goals.map((goal) => ({
        goal,
        path: null,
        failed: false,
      }));
      publish();
      await Promise.all(goals.map((goal) => plan(goal, mine)));
    },
    [curriculum, plan, publish],
  );

  const retry = useCallback(
    async (goal: string) => {
      const mine = round.current;
      proposals.current = proposals.current.map((proposal) =>
        sameGoal(proposal.goal, goal)
          ? { goal: proposal.goal, path: null, failed: false }
          : proposal,
      );
      publish();
      await plan(goal, mine);
    },
    [plan, publish],
  );

  const forget = useCallback(() => {
    round.current += 1;
  }, []);

  return { propose, retry, forget };
}
