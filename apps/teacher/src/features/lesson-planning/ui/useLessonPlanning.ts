import { useCallback, useEffect, useRef, useState } from "react";

import { useStableAcademicContext } from "../../academic-workspace/ui/useStableAcademicContext";
import type { LessonPlanningGateway } from "../application/LessonPlanningGateway";
import type {
  LessonContextRequest,
  ConfirmGranularLessonRequest,
  DiscardLessonRequest,
  GranularLessonProgramInputRequest,
  LessonWorkspaceSnapshot,
  MoveLessonDraftRequest,
  SaveLessonDraftRequest,
  SaveAuthoredLessonRequest,
  SaveGranularLessonRequest,
} from "../domain/lessonPlanning";

type LessonPlanningState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "ready";
      readonly snapshot: LessonWorkspaceSnapshot;
      readonly pendingAction: string | null;
      readonly actionError: string | null;
    };

/** Most callers only need to know a mutation landed; saveDraft needs what it wrote. */
const succeeded = (result: Promise<unknown>) => result.then(Boolean);

export function useLessonPlanning(
  gateway: LessonPlanningGateway,
  context: LessonContextRequest,
) {
  const [state, setState] = useState<LessonPlanningState>({ status: "loading" });
  const stableContext = useStableAcademicContext(context);
  // The newest read wins. Two reads overlap whenever a teacher arrives on a
  // named lesson — the screen's own opening read and the link's — and the one
  // that answers last would otherwise decide, which is how a link to one lesson
  // landed on another.
  const latestRead = useRef(0);

  const load = useCallback(
    async (selectedLessonId: string | null = null) => {
      const read = (latestRead.current += 1);
      setState({ status: "loading" });
      try {
        const snapshot = await gateway.getWorkspace({ context: stableContext, selectedLessonId });
        if (read !== latestRead.current) return true;
        setState({ status: "ready", snapshot, pendingAction: null, actionError: null });
        return true;
      } catch (error) {
        if (read !== latestRead.current) return false;
        setState({ status: "failed", message: errorMessage(error) });
        return false;
      }
    },
    [stableContext, gateway],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (action: string, operation: () => Promise<LessonWorkspaceSnapshot>) => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, pendingAction: action, actionError: null }
        : current,
    );
    try {
      const snapshot = await operation();
      setState({ status: "ready", snapshot, pendingAction: null, actionError: null });
      // Handed back so a caller can act on what it just wrote — preparing a
      // lesson needs the identity the save assigned it.
      return snapshot;
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? { ...current, pendingAction: null, actionError: errorMessage(error) }
          : current,
      );
      return null;
    }
  };

  const saveDraft = (request: Omit<SaveLessonDraftRequest, "context">) =>
    mutate("save-draft", () => gateway.saveDraft({ ...request, context }));
  const saveAuthoredLesson = (request: Omit<SaveAuthoredLessonRequest, "context">) =>
    succeeded(
      mutate("save-authored-lesson", () => gateway.saveAuthoredLesson({ ...request, context })),
    );
  const getGranularProgramInput = (request: Omit<GranularLessonProgramInputRequest, "context">) =>
    gateway.getGranularProgramInput({ ...request, context });
  const saveGranularLesson = (request: Omit<SaveGranularLessonRequest, "context">) =>
    succeeded(
      mutate("save-granular-lesson", () => gateway.saveGranularLesson({ ...request, context })),
    );
  const confirmGranularLesson = (request: Omit<ConfirmGranularLessonRequest, "context">) =>
    succeeded(
      mutate("confirm-granular-lesson", () => gateway.confirmGranularLesson({ ...request, context })),
    );
  const moveDraft = async (request: Omit<MoveLessonDraftRequest, "sourceContext">) => {
    const moved = await succeeded(
      mutate("move-draft", () => gateway.moveDraft({ ...request, sourceContext: context })),
    );
    if (moved) await load();
    return moved;
  };

  const discardLesson = (request: Omit<DiscardLessonRequest, "context">) =>
    succeeded(mutate("discard-lesson", () => gateway.discardLesson({ ...request, context })));

  return {
    state,
    load,
    saveDraft,
    saveAuthoredLesson,
    getGranularProgramInput,
    saveGranularLesson,
    confirmGranularLesson,
    moveDraft,
    discardLesson,
  };
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The lesson could not be updated. Try again.";
}
