import { useCallback } from "react";
import { saveDetails } from "@/features/onboarding/lib/details-save";
import { useI18n } from "@/lib/i18n-context";
import { getUserProfile } from "@/lib/user-storage";
import { detailsSaid } from "../lib/said-details";
import type { ActionOf } from "./use-chat-plan-edits";
import type { LearnerPlan } from "./use-learner-plan";

interface DetailsChangeDeps extends Pick<LearnerPlan, "applyCurriculum"> {
  onFailure: (message: string) => void;
}

/** What the learner tells the tutor of their school is kept as the details page keeps it, so
 * the subjects added after it are written for their class. It fills in a class not yet kept,
 * and never changes one that is. */
export function useDetailsChange({
  applyCurriculum,
  onFailure,
}: DetailsChangeDeps) {
  const { t } = useI18n();

  return useCallback(
    async (said: ActionOf<"set_details">) => {
      const profile = getUserProfile();
      // The server refuses to say what a learner whose class is kept may change; what the
      // model sends is not trusted to: only a class not yet kept is filled in.
      if (profile?.gradeLevel) return;
      const kept = await detailsSaid(said, profile).catch(() => null);
      const result = kept
        ? await saveDetails(kept.details, kept.voiceOnly, applyCurriculum)
        : "failed";
      if (result === "failed") onFailure(t("chat.detailsNotKept"));
    },
    [applyCurriculum, onFailure, t],
  );
}
