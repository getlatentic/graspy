import { useCallback, useRef } from "react";
import { planLearningPath, type LearningPath } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";

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

// Rounds are numbered so a dismissed or replaced one cannot reappear when its plans arrive.
export function usePathProposal(
  curriculum: CurriculumData | null,
  show: (proposals: PathProposals) => void,
) {
  const latest = useRef(0);

  const propose = useCallback(
    async (goals: string[]) => {
      if (!curriculum) return;
      const round = ++latest.current;
      const proposals: PathProposal[] = goals.map((goal) => ({
        goal,
        path: null,
        failed: false,
      }));
      const publish = () =>
        show({ type: "propose_path", proposals: [...proposals] });
      publish();
      await Promise.all(
        goals.map(async (goal, index) => {
          let path: LearningPath | null = null;
          try {
            path = await planLearningPath({
              country: curriculum.country,
              language: curriculum.language,
              gradeLevel: curriculum.gradeLevel,
              goal,
            });
          } catch (error) {
            console.error("Planning a path failed:", error);
          }
          if (latest.current !== round) return;
          proposals[index] = { goal, path, failed: !path };
          publish();
        }),
      );
    },
    [curriculum, show],
  );

  const forget = useCallback(() => {
    latest.current += 1;
  }, []);

  return { propose, forget };
}
