import { useCallback, useEffect, useMemo, useState } from "react";

import type { ClassworkGateway } from "../application/ClassworkGateway";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import { useStableAcademicContext } from "../../academic-workspace/ui/useStableAcademicContext";
import { generationActive } from "../domain/classworkRun";
import type { ClassworkWorkspaceSnapshot } from "../domain/classwork";

type State =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: ClassworkWorkspaceSnapshot; readonly actionError: string | null };

/** How often an active run is re-read. The backend owns the work; the database is the truth. */
const ACTIVE_REREAD_MS = 2_000;


/**
 * The screen's view of a classwork run the backend drives. Starting, retrying
 * and recreating are single asks; while work is open the workspace re-reads on
 * a short beat, and closing the screen leaves the run entirely alone.
 */
export function useClassworkGeneration(gateway: ClassworkGateway, context: LessonContextRequest, lessonId: string) {
  const [state, setState] = useState<State>({ status: "loading" });
  const stableContext = useStableAcademicContext(context);
  const request = useMemo(() => ({ context: stableContext, lessonId }), [stableContext, lessonId]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try { setState({ status: "ready", snapshot: await gateway.getWorkspace(request), actionError: null }); }
    catch (error) { setState({ status: "failed", message: message(error) }); }
  }, [gateway, request]);

  useEffect(() => { void load(); }, [load]);

  // The quiet beat behind an active run: replaces the snapshot without ever
  // flashing a loading state at the teacher.
  const active = state.status === "ready" && generationActive(state.snapshot);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void gateway
        .getWorkspace(request)
        .then((snapshot) => {
          setState((current) =>
            current.status === "ready" ? { ...current, snapshot } : current,
          );
        })
        .catch(() => {
          // The next beat is close, and the run is unaffected.
        });
    }, ACTIVE_REREAD_MS);
    return () => clearInterval(timer);
  }, [active, gateway, request]);

  const apply = (work: () => Promise<ClassworkWorkspaceSnapshot>) => {
    return work()
      .then((snapshot) => {
        setState({ status: "ready", snapshot, actionError: null });
        return snapshot;
      })
      .catch((error: unknown) => {
        setState((current) => current.status === "ready" ? { ...current, actionError: message(error) } : current);
        return null;
      });
  };

  const start = async () => { await apply(() => gateway.runGeneration(request)); };
  const resume = () => { void apply(() => gateway.runGeneration(request)); };
  const retry = async (sectionId: string) => {
    await apply(() => gateway.runGeneration({ ...request, sectionId }));
  };
  const cancel = () => {
    if (state.status !== "ready" || !state.snapshot.run) return;
    void gateway.cancelGeneration(state.snapshot.run.taskId).catch(() => undefined);
  };
  const recreateSection = async (sectionId: string, expectedVersionNumber: number, teacherDirection: string | null) => {
    if (state.status !== "ready" || !state.snapshot.run) return;
    const runId = state.snapshot.run.id;
    await apply(() => gateway.regenerateSection({ context, runId, sectionId, expectedVersionNumber, teacherDirection }));
  };
  const getSectionHistory = async (sectionId: string) => {
    if (state.status !== "ready" || !state.snapshot.run) throw new Error("The section history is not ready.");
    try {
      return await gateway.getSectionHistory({ context, runId: state.snapshot.run.id, sectionId });
    } catch (error) {
      throw new Error(message(error));
    }
  };
  const restoreSection = async (sectionId: string, sourceVersionNumber: number, expectedVersionNumber: number) => {
    if (state.status !== "ready" || !state.snapshot.run) throw new Error("The lesson draft is not ready to restore.");
    const runId = state.snapshot.run.id;
    try {
      const snapshot = await gateway.restoreSection({ context, runId, sectionId, sourceVersionNumber, expectedVersionNumber });
      setState({ status: "ready", snapshot, actionError: null });
    } catch (error) {
      throw new Error(message(error));
    }
  };
  const editBlock = async (blockId: string, expectedVersionNumber: number, text: string) => {
    if (state.status !== "ready" || !state.snapshot.run) throw new Error("The lesson draft is not ready to edit.");
    const runId = state.snapshot.run.id;
    try {
      const snapshot = await gateway.editBlock({ context, runId, blockId, expectedVersionNumber, text });
      setState({ status: "ready", snapshot, actionError: null });
    } catch (error) {
      throw new Error(message(error));
    }
  };
  const approveVersion = async (expectedVersionNumber: number) => {
    if (state.status !== "ready" || !state.snapshot.run) throw new Error("The lesson draft is not ready to approve.");
    const runId = state.snapshot.run.id;
    try {
      const snapshot = await gateway.approveVersion({ context, runId, expectedVersionNumber });
      setState({ status: "ready", snapshot, actionError: null });
    } catch (error) {
      const failure = message(error);
      setState((current) => current.status === "ready" ? { ...current, actionError: failure } : current);
      throw new Error(failure);
    }
  };

  // `active` is the screen's only honest signal that the backend already holds
  // this lesson's slot. Anything that would start a second run has to read it,
  // because the command behind it can only refuse.
  return { state, active, load, start, resume, retry, cancel, editBlock, approveVersion, recreateSection, getSectionHistory, restoreSection };
}

function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : typeof error === "string" && error.trim() ? error : "The classwork could not be updated. Try again."; }
