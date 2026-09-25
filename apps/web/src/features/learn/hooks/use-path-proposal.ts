import { useCallback, useRef } from "react";
import { planLearningPath, type LearningPath } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";

export interface PathProposal {
  type: "propose_path";
  goal: string;
  path: LearningPath | null;
  failed: boolean;
}

// Proposals are numbered so a dismissed or replaced one cannot reappear when its plan arrives.
export function usePathProposal(
  curriculum: CurriculumData | null,
  show: (proposal: PathProposal) => void,
) {
  const latest = useRef(0);

  const propose = useCallback(
    async (goal: string) => {
      if (!curriculum) return;
      const proposal = ++latest.current;
      show({ type: "propose_path", goal, path: null, failed: false });
      const settle = (path: LearningPath | null) => {
        if (latest.current !== proposal) return;
        show({ type: "propose_path", goal, path, failed: !path });
      };
      try {
        settle(
          await planLearningPath({
            country: curriculum.country,
            language: curriculum.language,
            gradeLevel: curriculum.gradeLevel,
            goal,
          }),
        );
      } catch (error) {
        console.error("Planning a path failed:", error);
        settle(null);
      }
    },
    [curriculum, show],
  );

  const forget = useCallback(() => {
    latest.current += 1;
  }, []);

  return { propose, forget };
}
