import { useCallback, useEffect, useRef } from "react";
import { planLearningPath, type LearningPath } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";
import { nameKey } from "../lib/name-key";

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

const sameGoal = (a: string, b: string) => nameKey(a) === nameKey(b);

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
  // The request of each course being planned, to end it when it times out, is tried again or is no longer wanted.
  const requests = useRef(new Map<string, AbortController>());
  const endRound = useCallback(() => {
    round.current += 1;
    requests.current.forEach((request) => request.abort());
    requests.current.clear();
  }, []);
  useEffect(() => endRound, [endRound]);

  const publish = useCallback(() => {
    show({ type: "propose_path", proposals: [...proposals.current] });
  }, [show]);

  const plan = useCallback(
    async (goal: string, mine: number) => {
      if (!curriculum) return;
      const key = nameKey(goal);
      requests.current.get(key)?.abort();
      const request = new AbortController();
      requests.current.set(key, request);
      const timer = setTimeout(() => request.abort(), PATH_PLAN_TIMEOUT_MS);
      let path: LearningPath | null = null;
      try {
        const planned = await planLearningPath(
          {
            country: curriculum.country,
            language: curriculum.language,
            gradeLevel: curriculum.gradeLevel,
            goal,
          },
          request.signal,
        );
        // A path with no step is nothing to add.
        path = planned.steps.length > 0 ? planned : null;
      } catch (error) {
        console.error("Planning a path failed:", error);
      } finally {
        clearTimeout(timer);
        if (requests.current.get(key) === request) requests.current.delete(key);
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
      endRound();
      const mine = round.current;
      proposals.current = goals.map((goal) => ({
        goal,
        path: null,
        failed: false,
      }));
      publish();
      await Promise.all(goals.map((goal) => plan(goal, mine)));
    },
    [curriculum, endRound, plan, publish],
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

  /** The courses that are ready, taken off the card at once so a second tap finds none; the ones
   * still planning or failed stay on it. */
  const takeReady = useCallback(() => {
    const taken = proposals.current.filter(({ path }) => path);
    proposals.current = proposals.current.filter(({ path }) => !path);
    if (taken.length > 0 && proposals.current.length > 0) publish();
    return { taken, remaining: proposals.current.length, round: round.current };
  }, [publish]);

  /** Courses taken but not added, such as those the plan had no room for, go back on the card
   * unless the card has been dismissed or replaced since. */
  const putBack = useCallback(
    (back: PathProposal[], from: number) => {
      if (back.length === 0 || round.current !== from) return;
      proposals.current = [...back, ...proposals.current];
      publish();
    },
    [publish],
  );

  return { propose, retry, takeReady, putBack, forget: endRound };
}
