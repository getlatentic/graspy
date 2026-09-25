import { useCallback, useEffect, useMemo, useState } from "react";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import { useStableAcademicContext } from "../../academic-workspace/ui/useStableAcademicContext";
import type { DifferentiatedClassworkGateway } from "../application/DifferentiatedClassworkGateway";
import type { DifferentiatedClassworkWorkspaceSnapshot } from "../domain/differentiatedClasswork";

type State =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: DifferentiatedClassworkWorkspaceSnapshot; readonly actionError: string | null };

/** How often an active run is re-read. The backend owns the work; the database is the truth. */
const ACTIVE_REREAD_MS = 2_000;

function generationActive(snapshot: DifferentiatedClassworkWorkspaceSnapshot): boolean {
  const run = snapshot.run;
  if (!run) return false;
  return run.groups.some((group) =>
    group.sections.some(({ status }) => status === "generating" || status === "pending"),
  );
}

/**
 * The screen's view of a group-classwork run the backend drives. Starting and
 * retrying are single asks; while work is open the workspace re-reads on a
 * short beat, and closing the screen leaves the run entirely alone.
 */
export function useDifferentiatedClassworkGeneration(
  gateway: DifferentiatedClassworkGateway,
  context: LessonContextRequest,
  lessonId: string,
) {
  const [state, setState] = useState<State>({ status: "loading" });
  const stableContext = useStableAcademicContext(context);
  const request = useMemo(() => ({ context: stableContext, lessonId }), [stableContext, lessonId]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", snapshot: await gateway.getWorkspace(request), actionError: null });
    } catch (error) {
      setState({ status: "failed", message: message(error) });
    }
  }, [gateway, request]);

  useEffect(() => { void load(); }, [load]);

  const active = state.status === "ready" && generationActive(state.snapshot);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void gateway
        .getWorkspace(request)
        .then((snapshot) => {
          setState((current) => current.status === "ready" ? { ...current, snapshot } : current);
        })
        .catch(() => {
          // The next beat is close, and the run is unaffected.
        });
    }, ACTIVE_REREAD_MS);
    return () => clearInterval(timer);
  }, [active, gateway, request]);

  const run = async (sectionId?: string) => {
    try {
      const snapshot = await gateway.runGeneration(sectionId ? { ...request, sectionId } : request);
      setState({ status: "ready", snapshot, actionError: null });
    } catch (error) {
      setState((current) => current.status === "ready" ? { ...current, actionError: message(error) } : current);
    }
  };

  const start = async () => { await run(); };
  const resume = () => { void run(); };
  const retry = async (sectionId: string) => { await run(sectionId); };
  const cancel = () => {
    if (state.status !== "ready" || !state.snapshot.run) return;
    void gateway.cancelGeneration(state.snapshot.run.taskId).catch(() => undefined);
  };

  return { state, load, start, resume, retry, cancel };
}

function message(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : typeof error === "string" && error.trim()
      ? error
      : "The group classwork could not be updated. Try again.";
}
