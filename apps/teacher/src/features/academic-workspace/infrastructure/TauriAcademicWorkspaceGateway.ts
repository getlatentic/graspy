import { invoke } from "@tauri-apps/api/core";

import type { AcademicWorkspaceGateway } from "../application/AcademicWorkspaceGateway";
import {
  academicWorkspaceSnapshotSchema,
  type AcademicWorkspaceSnapshot,
  type CreateAcademicSessionRequest,
  type CreateAcademicWorkspaceRequest,
  type SaveTeachingAssignmentRequest,
  type SetActiveAcademicContextRequest,
  type UpdateTeachingAssignmentRequest,
} from "../domain/academicWorkspace";
import type { AssignCurriculumCourseRequest } from "../../curriculum-catalog/domain/curriculumCatalog";

export type NativeInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export class TauriAcademicWorkspaceGateway implements AcademicWorkspaceGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  getSnapshot(): Promise<AcademicWorkspaceSnapshot> {
    return this.call("get_academic_workspace");
  }

  createWorkspace(
    request: CreateAcademicWorkspaceRequest,
  ): Promise<AcademicWorkspaceSnapshot> {
    return this.call("create_academic_workspace", { request });
  }

  createSession(
    request: CreateAcademicSessionRequest,
  ): Promise<AcademicWorkspaceSnapshot> {
    return this.call("create_academic_session", { request });
  }

  addAssignment(
    request: SaveTeachingAssignmentRequest,
  ): Promise<AcademicWorkspaceSnapshot> {
    return this.call("add_teaching_assignment", { request });
  }

  updateAssignment(
    request: UpdateTeachingAssignmentRequest,
  ): Promise<AcademicWorkspaceSnapshot> {
    return this.call("update_teaching_assignment", { request });
  }

  archiveAssignment(assignmentId: string): Promise<AcademicWorkspaceSnapshot> {
    return this.call("archive_teaching_assignment", { assignmentId });
  }

  assignCurriculumCourse(
    request: AssignCurriculumCourseRequest,
  ): Promise<AcademicWorkspaceSnapshot> {
    return this.call("assign_curriculum_course", { request });
  }

  setActiveContext(
    request: SetActiveAcademicContextRequest,
  ): Promise<AcademicWorkspaceSnapshot> {
    return this.call("set_active_academic_context", { request });
  }

  private async call(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<AcademicWorkspaceSnapshot> {
    const payload = await this.nativeInvoke<unknown>(command, args);
    return academicWorkspaceSnapshotSchema.parse(payload);
  }
}
