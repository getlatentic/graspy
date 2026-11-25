import { useCallback } from "react";
import { saveDetails } from "@/features/onboarding/lib/details-save";
import type { CurriculumData } from "@/lib/curriculum-record";
import { useI18n } from "@/lib/i18n-context";
import { getUserProfile } from "@/lib/user-storage";
import { detailsSaid } from "../lib/said-details";
import type { ActionOf } from "./use-chat-plan-edits";
import type { LearnerPlan } from "./use-learner-plan";

interface DetailsChangeDeps extends Pick<LearnerPlan, "applyCurriculum"> {
  /** The plan as it is now. */
  read: () => CurriculumData | null;
  onFailure: (message: string) => void;
}

/** What the learner tells the tutor of their school is kept as the details page keeps it, so
 * the subjects added after it are written for their class. It fills in the details of a learner
 * with no class or subject yet, and never changes anyone else's. */
export function useDetailsChange({
  read,
  applyCurriculum,
  onFailure,
}: DetailsChangeDeps) {
  const { t } = useI18n();

  return useCallback(
    async (said: ActionOf<"set_details">) => {
      const profile = getUserProfile();
      // The server refuses a learner who has a class or a subject; what the model sends is not
      // trusted to: only a learner with neither is filled in.
      if (profile?.gradeLevel || (read()?.subjects.length ?? 0) > 0) return;
      const kept = await detailsSaid(said, profile).catch(() => null);
      const result = kept
        ? await saveDetails(kept.details, kept.voiceOnly, applyCurriculum)
        : "failed";
      if (result === "failed") onFailure(t("chat.detailsNotKept"));
    },
    [applyCurriculum, onFailure, read, t],
  );
}
