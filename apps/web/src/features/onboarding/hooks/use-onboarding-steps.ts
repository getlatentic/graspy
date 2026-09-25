import { useState } from "react";
import { useNavigate } from "react-router";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { DETAILS_PAGE } from "@/features/learn/lib/app-sections";
import { detailsComplete } from "../lib/details";
import type {
  DetailsSchema,
  OnboardingSchema,
} from "../schemas/onboarding-schema";
import type { GeneratedSubject } from "../types";
import { useSubjectChoices } from "./use-subject-choices";

export const STEPS = ["profile", "subjects"] as const;
export type StepKey = (typeof STEPS)[number];

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
  const [index, setIndex] = useState(replan ? 1 : 0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const values = form.watch();
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
