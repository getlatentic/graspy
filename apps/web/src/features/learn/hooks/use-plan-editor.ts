import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { changeSubjects } from "../lib/change-subjects";
import { rebuildRequest } from "../lib/curriculum-request";
import { usePlan } from "../learner-context";

export function usePlanEditor() {
  const { t } = useI18n();
  const { curriculum, applyCurriculum, regenerate } = usePlan();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const saveSubjects = useCallback(
    async (names: string[]): Promise<boolean> => {
      if (!curriculum || names.length === 0) return false;
      setSaving(true);
      setFailed(false);
      try {
        await applyCurriculum(await changeSubjects(curriculum, names));
        return true;
      } catch (error) {
        console.error("Changing subjects failed:", error);
        setFailed(true);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [applyCurriculum, curriculum],
  );

  const rebuild = useCallback(async () => {
    const request = curriculum && rebuildRequest(curriculum);
    if (request) await regenerate(request, t);
  }, [curriculum, regenerate, t]);

  return { saveSubjects, rebuild, saving, failed };
}

export type PlanEditor = ReturnType<typeof usePlanEditor>;
