import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { streamCurriculum, type CurriculumRequest } from "@/lib/curriculum-api";
import { saveCurriculum } from "@/lib/curriculum-db";
import {
  planIdFor,
  type CurriculumData,
  type CurriculumSubject,
} from "@/lib/curriculum-record";
import { planDetails } from "@/lib/plan-details";
import { normalizeSubjectList } from "@/lib/slug";
import { getUserProfile } from "@/lib/user-storage";
import {
  buildCurriculum,
  CurriculumAccumulator,
} from "../lib/curriculum-accumulator";
import { prepareFirstLesson } from "../lib/first-lesson";
import { PlanTimer, reportPlanTimings } from "../lib/plan-timing";
import type { Translate } from "@/lib/i18n-context";

interface PlanGenerationDeps {
  show: (plan: CurriculumData) => void;
  next: () => CurriculumSubject | null;
  chooseNext: (subject: CurriculumSubject | null) => void;
  gradeLevel: string | undefined;
}

async function followPlanStream(
  request: CurriculumRequest,
  accumulator: CurriculumAccumulator,
  onChange: () => void,
): Promise<string | null> {
  for await (const chunk of streamCurriculum(request)) {
    if (chunk.type === "error") return chunk.message;
    if (chunk.type !== "status" && accumulator.apply(chunk)) onChange();
  }
  return null;
}

function failureMessage(error: unknown, t: Translate): string {
  return error instanceof ApiError && error.retryable
    ? t("chat.temporaryProblem")
    : t("chat.errorMessage", { error: "Curriculum generation failed" });
}

/** Every plan request is made from the learner's details as the device keeps them. */
function learnerPlanDetails(currentGrade: string | undefined) {
  const learner = getUserProfile();
  if (!learner) throw new Error("No learner profile to plan for");
  const details = planDetails(learner);
  return { ...details, gradeLevel: details.gradeLevel || currentGrade };
}

/** Made after the plan is kept and shown, so a slow or failed lesson never holds the plan back. */
async function primeFirstLesson(
  plan: CurriculumData,
  first: CurriculumSubject,
  timer: PlanTimer,
): Promise<void> {
  timer.lessonStarted();
  const made = await prepareFirstLesson(plan, first);
  if (made) timer.lessonDone();
  reportPlanTimings(timer.timings(plan.subjects.length));
}

/** Returns the stream's own error message; throws on any other failure. The plan is kept once its
 * topics are in, and the first lesson is made after, in the background. */
async function makePlan(
  request: CurriculumRequest,
  deps: PlanGenerationDeps,
): Promise<string | null> {
  const timer = new PlanTimer();
  const createdAt = Date.now();
  const details = learnerPlanDetails(deps.gradeLevel);
  const { subjects } = normalizeSubjectList(
    (request.subjects ?? []).map((s) => s.trim()).filter(Boolean),
  );
  const accumulator = new CurriculumAccumulator(subjects);
  const planNow = () =>
    buildCurriculum({
      ...details,
      planId: planIdFor(createdAt),
      createdAt,
      subjects: accumulator.subjects,
      topics: accumulator.topics,
      sources: accumulator.sources,
      nextSubjectSlug: deps.next()?.slug ?? null,
    });
  deps.chooseNext(subjects[0] ?? null);
  deps.show(planNow());

  const failure = await followPlanStream(request, accumulator, () => {
    if (!deps.next()) deps.chooseNext(accumulator.firstSubject);
    if (Object.keys(accumulator.topics).length > 0) timer.firstSubject();
    deps.show(planNow());
  });
  if (failure) return failure;
  timer.streamDone();
  const first = deps.next() ?? accumulator.firstSubject;
  if (!first) return null;

  const plan = planNow();
  await saveCurriculum(plan);
  void primeFirstLesson(plan, first, timer);
  return null;
}

export function usePlanGeneration({
  show,
  next,
  chooseNext,
  gradeLevel,
}: PlanGenerationDeps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Repeated taps land before isGenerating re-renders.
  const inFlightRef = useRef(false);

  const generate = useCallback(
    async (request: CurriculumRequest, t: Translate) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsGenerating(true);
      setError(null);
      try {
        const failure = await makePlan(request, {
          show,
          next,
          chooseNext,
          gradeLevel,
        });
        if (failure) setError(failure);
      } catch (err) {
        setError(failureMessage(err, t));
      } finally {
        inFlightRef.current = false;
        setIsGenerating(false);
      }
    },
    [chooseNext, gradeLevel, next, show],
  );

  return { generate, isGenerating, error };
}
