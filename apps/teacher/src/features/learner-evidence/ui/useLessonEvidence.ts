import { useCallback, useEffect, useMemo, useState } from "react";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import { useStableAcademicContext } from "../../academic-workspace/ui/useStableAcademicContext";
import type { LessonEvidenceGateway } from "../application/LessonEvidenceGateway";
import type { SaveLessonEvidenceRequest, LessonEvidenceWorkspaceSnapshot } from "../domain/lessonEvidence";

type State =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: LessonEvidenceWorkspaceSnapshot; readonly saving: boolean; readonly actionError: string | null };

export function useLessonEvidence(gateway: LessonEvidenceGateway, context: LessonContextRequest, lessonId: string) {
  const [state, setState] = useState<State>({ status: "loading" });
  const stableContext = useStableAcademicContext(context);
  const request = useMemo(() => ({ context: stableContext, lessonId }), [stableContext, lessonId]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", snapshot: await gateway.getWorkspace(request), saving: false, actionError: null });
    } catch (error) {
      setState({ status: "failed", message: message(error) });
    }
  }, [gateway, request]);

  useEffect(() => { void load(); }, [load]);

  const save = async (input: Omit<SaveLessonEvidenceRequest, "context" | "lessonId">) => {
    if (state.status !== "ready" || state.saving) return false;
    setState({ ...state, saving: true, actionError: null });
    try {
      const snapshot = await gateway.save({ ...request, ...input });
      setState({ status: "ready", snapshot, saving: false, actionError: null });
      return true;
    } catch (error) {
      setState({ ...state, saving: false, actionError: message(error) });
      return false;
    }
  };

  return { state, load, save };
}

function message(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : typeof error === "string" && error.trim()
      ? error
      : "The class results could not be updated. Try again.";
}
