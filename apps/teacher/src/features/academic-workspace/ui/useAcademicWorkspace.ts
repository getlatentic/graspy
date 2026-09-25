import { useCallback, useEffect, useState } from "react";

import type { AcademicWorkspaceGateway } from "../application/AcademicWorkspaceGateway";
import type {
  AcademicWorkspaceSnapshot,
  CreateAcademicSessionRequest,
  CreateAcademicWorkspaceRequest,
  SaveTeachingAssignmentRequest,
  SetActiveAcademicContextRequest,
  UpdateTeachingAssignmentRequest,
} from "../domain/academicWorkspace";
import type { AssignCurriculumCourseRequest } from "../../curriculum-catalog/domain/curriculumCatalog";

type AcademicWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "ready";
      readonly snapshot: AcademicWorkspaceSnapshot;
      readonly pendingAction: string | null;
      readonly actionError: string | null;
    };

export function useAcademicWorkspace(gateway: AcademicWorkspaceGateway) {
  const [state, setState] = useState<AcademicWorkspaceState>({
    status: "loading",
  });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const snapshot = await gateway.getSnapshot();
      setState({
        status: "ready",
        snapshot,
        pendingAction: null,
        actionError: null,
      });
    } catch (error) {
      setState({ status: "failed", message: errorMessage(error) });
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const runMutation = async (
    action: string,
    operation: () => Promise<AcademicWorkspaceSnapshot>,
  ) => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, pendingAction: action, actionError: null }
        : current,
    );
    try {
      const snapshot = await operation();
      setState({
        status: "ready",
        snapshot,
        pendingAction: null,
        actionError: null,
      });
      return true;
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              pendingAction: null,
              actionError: errorMessage(error),
            }
          : current,
      );
      return false;
    }
  };

  const createWorkspace = (request: CreateAcademicWorkspaceRequest) =>
    runMutation("create-workspace", () => gateway.createWorkspace(request));
  const createSession = (request: CreateAcademicSessionRequest) =>
    runMutation("create-session", () => gateway.createSession(request));
  const addAssignment = (request: SaveTeachingAssignmentRequest) =>
    runMutation("add-assignment", () => gateway.addAssignment(request));
  const updateAssignment = (request: UpdateTeachingAssignmentRequest) =>
    runMutation(`update-${request.assignmentId}`, () =>
      gateway.updateAssignment(request),
    );
  const archiveAssignment = (assignmentId: string) =>
    runMutation(`archive-${assignmentId}`, () =>
      gateway.archiveAssignment(assignmentId),
    );
  const assignCurriculumCourse = (request: AssignCurriculumCourseRequest) =>
    runMutation(`curriculum-${request.assignmentId}`, () =>
      gateway.assignCurriculumCourse(request),
    );
  const setActiveContext = (request: SetActiveAcademicContextRequest) =>
    runMutation("switch-context", () => gateway.setActiveContext(request));

  return {
    state,
    reload: load,
    createWorkspace,
    createSession,
    addAssignment,
    updateAssignment,
    archiveAssignment,
    assignCurriculumCourse,
    setActiveContext,
  };
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The academic workspace could not be updated. Try again.";
}
