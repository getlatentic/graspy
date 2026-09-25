import { useCallback, useRef, useState } from "react";
import type { CurriculumRequest } from "@/lib/curriculum-api";
import { getCurriculum, savePlanChange } from "@/lib/curriculum-db";
import type {
  CurriculumData,
  CurriculumSubject,
} from "@/lib/curriculum-record";
import type { Translate } from "@/lib/i18n-context";
import { emptyCurriculum } from "../lib/curriculum-accumulator";
import { carryPaths, loadSavedPlan } from "../lib/saved-plan";
import { usePlanGeneration } from "./use-plan-generation";
import { usePlanSync } from "./use-plan-sync";

type Show = (plan: CurriculumData) => void;
type ChooseNext = (subject: CurriculumSubject | null) => void;

/** The ref lets a streaming plan read the current next subject, not a stale one. */
function useNextSubject() {
  const [nextSubject, setNextSubject] = useState<CurriculumSubject | null>(
    null,
  );
  const ref = useRef<CurriculumSubject | null>(null);
  const chooseNext = useCallback((subject: CurriculumSubject | null) => {
    ref.current = subject;
    setNextSubject(subject);
  }, []);
  const nextOf = useCallback(() => ref.current, []);
  return { nextSubject, chooseNext, nextOf };
}

/** Shows a plan read from storage or the account, with the subject it names next. */
function usePresent(show: Show, chooseNext: ChooseNext) {
  return useCallback(
    (plan: CurriculumData) => {
      show(plan);
      const next = plan.assessment?.nextSubject;
      chooseNext(plan.subjects.find(({ slug }) => slug === next) ?? null);
    },
    [show, chooseNext],
  );
}

function useSavedPlan(present: Show) {
  const [isLoaded, setIsLoaded] = useState(false);
  const loadSaved = useCallback(async () => {
    try {
      const saved = await loadSavedPlan();
      if (saved) present(saved);
    } catch (err) {
      console.error("Failed to load data from IndexedDB:", err);
    } finally {
      setIsLoaded(true);
    }
  }, [present]);
  return { isLoaded, loadSaved };
}

export function useLearnerPlan() {
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(
    emptyCurriculum,
  );
  const { nextSubject, chooseNext, nextOf } = useNextSubject();
  const present = usePresent(setCurriculum, chooseNext);
  const { isLoaded, loadSaved } = useSavedPlan(present);
  const { generate, isGenerating, isPrimingLesson, error } = usePlanGeneration({
    show: setCurriculum,
    next: nextOf,
    chooseNext,
    gradeLevel: curriculum?.gradeLevel,
  });
  const sync = usePlanSync(isLoaded && !isGenerating, present);

  const applyCurriculum = useCallback(
    async (next: CurriculumData) => {
      setCurriculum({ ...next, updatedAt: Date.now() });
      await savePlanChange(next);
      sync();
    },
    [sync],
  );

  const regenerate = useCallback(
    async (request: CurriculumRequest, t: Translate) => {
      const previous = curriculum;
      await generate(request, t);
      const rebuilt = await getCurriculum();
      if (!previous || !rebuilt || rebuilt.planId === previous.planId) return;
      const withPaths = await carryPaths(previous, rebuilt);
      if (withPaths) await applyCurriculum(withPaths);
    },
    [applyCurriculum, curriculum, generate],
  );

  return {
    curriculum,
    isLoaded,
    isGenerating,
    isPrimingLesson,
    error,
    generate,
    regenerate,
    applyCurriculum,
    loadSaved,
    nextSubject,
  };
}

export type LearnerPlan = ReturnType<typeof useLearnerPlan>;
