import { useCallback, useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { readStart } from "@/lib/start-intent";
import { detailsComplete, learnerDetails } from "../lib/details";
import { seededSelection } from "../lib/subject-selection";
import type { OnboardingSchema } from "../schemas/onboarding-schema";
import { useSubjects } from "./use-subjects";

/** Asked for each time the subjects step opens. The first to arrive seed
    the choice when the learner has chosen none. */
export function useSubjectChoices(
  form: UseFormReturn<OnboardingSchema>,
  open: boolean,
) {
  const { getValues, setValue } = form;
  const { subjectsState, isSubjectsQueryLoading, fetchSubjects } =
    useSubjects();
  const available = subjectsState.subjects;
  const [seeded, setSeeded] = useState(false);

  const refetch = useCallback(() => {
    const details = getValues();
    if (!detailsComplete(details)) return;
    fetchSubjects({
      country: details.country,
      language: details.language,
      gradeLevel: learnerDetails(details).gradeLevel,
    });
  }, [getValues, fetchSubjects]);

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  useEffect(() => {
    if (available.length === 0) return setSeeded(false);
    if (!open || seeded) return;
    if (getValues("selectedSubjects").length === 0) {
      const seed = seededSelection(available, readStart()?.subject);
      if (seed.length > 0) {
        setValue("selectedSubjects", seed, { shouldValidate: true });
      }
    }
    setSeeded(true);
  }, [open, seeded, available, getValues, setValue]);

  return {
    available,
    loading: isSubjectsQueryLoading,
    error: subjectsState.error,
    refetch,
  };
}
