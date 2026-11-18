import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Shows the plan the device holds again, once a new one could not be made. */
  restore: () => Promise<void>;
}

interface MakePlanDeps extends Omit<PlanGenerationDeps, "restore"> {
  /** Ends the first lesson's wait when the learner moves on from this plan. */
  signal: AbortSignal;
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

/** The first subject that has topics, the chosen next one if it does. */
function firstWithTopics(
  accumulator: CurriculumAccumulator,
  chosen: CurriculumSubject | null,
): CurriculumSubject | null {
  const topics = accumulator.topics;
  const has = (subject: CurriculumSubject) => !!topics[subject.slug]?.length;
  if (chosen && has(chosen)) return chosen;
  return accumulator.subjects.find(has) ?? null;
}

/** Made after the plan is kept and shown, so a slow or failed lesson never holds the plan back. */
async function primeFirstLesson(
  plan: CurriculumData,
  first: CurriculumSubject,
  timer: PlanTimer,
  signal: AbortSignal,
): Promise<void> {
  timer.lessonStarted();
  const made = await prepareFirstLesson(plan, first, signal);
  if (made) timer.lessonDone();
  reportPlanTimings(timer.timings(plan.subjects.length));
}

/** The plan is on the screen already; a device that cannot keep it (no room, private mode) still
 * lets the learner in, and the plan is made again the next time the app starts. */
async function keepPlan(plan: CurriculumData): Promise<void> {
  try {
    await saveCurriculum(plan);
  } catch (error) {
    console.warn("The plan could not be kept on this device:", error);
  }
}

/** Returns the stream's own error message; throws on any other failure. The plan is kept once its
 * topics are in, and the first lesson is made after, in the background. */
async function makePlan(
  request: CurriculumRequest,
  deps: MakePlanDeps,
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
  // The request's own subjects are in the plan before any topic comes.
  const first = firstWithTopics(accumulator, deps.next());
  if (!first) throw new ApiError("The plan stream ended with no topics", 502);

  const plan = planNow();
  deps.show(plan);
  await keepPlan(plan);
  void primeFirstLesson(plan, first, timer, deps.signal);
  return null;
}

export function usePlanGeneration({
  show,
  next,
  chooseNext,
  gradeLevel,
  restore,
}: PlanGenerationDeps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Repeated taps land before isGenerating re-renders.
  const inFlightRef = useRef(false);
  // One first lesson is waited for at a time, and none once the learner has moved on.
  const primingRef = useRef<AbortController | null>(null);
  useEffect(() => () => primingRef.current?.abort(), []);

  const generate = useCallback(
    async (request: CurriculumRequest, t: Translate) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsGenerating(true);
      setError(null);
      primingRef.current?.abort();
      const priming = new AbortController();
      primingRef.current = priming;
      // What the learner had stays on the screen as it stays on the device.
      const giveUp = async (message: string) => {
        setError(message);
        await restore().catch((err: unknown) =>
          console.warn("Showing the kept plan again failed:", err),
        );
      };
      try {
        const failure = await makePlan(request, {
          show,
          next,
          chooseNext,
          gradeLevel,
          signal: priming.signal,
        });
        if (failure) await giveUp(failure);
      } catch (err) {
        await giveUp(failureMessage(err, t));
      } finally {
        inFlightRef.current = false;
        setIsGenerating(false);
      }
    },
    [chooseNext, gradeLevel, next, restore, show],
  );

  return { generate, isGenerating, error };
}
