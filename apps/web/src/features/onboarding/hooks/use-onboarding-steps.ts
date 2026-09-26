import { useState } from "react";
import { useNavigate } from "react-router";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { DETAILS_PAGE } from "@/features/learn/lib/app-sections";
import { detailsComplete } from "../lib/details";
import { stepsFor, type StepKey } from "../lib/onboarding-steps";
import type {
  DetailsSchema,
  OnboardingSchema,
} from "../schemas/onboarding-schema";
import type { GeneratedSubject } from "../types";
import { useSubjectChoices } from "./use-subject-choices";

const STEP_FIELDS: Record<StepKey, FieldPath<OnboardingSchema>[]> = {
  profile: ["country", "language", "system", "level", "course"],
  subjects: ["selectedSubjects"],
};

/** A learner replanning goes back to the details they were changing. */
export function useOnboardingSteps(
  form: UseFormReturn<OnboardingSchema>,
  replan: DetailsSchema | undefined,
  finish: (data: OnboardingSchema, subjects: GeneratedSubject[]) => void,
) {
  const navigate = useNavigate();
  const [chosen, setIndex] = useState(replan ? 1 : 0);
  const values = form.watch();
  const steps = stepsFor(values);
  const index = Math.min(chosen, steps.length - 1);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const subjects = useSubjectChoices(form, step === "subjects");

  const next = async () => {
    if (!(await form.trigger(STEP_FIELDS[step]))) return;
    if (isLast) finish(form.getValues(), subjects.available);
    else setIndex(index + 1);
  };

  const back = () => {
    if (!replan) return setIndex(index - 1);
    navigate(DETAILS_PAGE, { state: { draft: replan }, replace: true });
  };

  return {
    step,
    index,
    count: steps.length,
    isLast,
    subjects,
    canNext:
      step === "profile"
        ? detailsComplete(values)
        : values.selectedSubjects.length > 0 &&
          !subjects.loading &&
          !subjects.error,
    next,
    back,
  };
}
