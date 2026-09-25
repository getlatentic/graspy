import type {
  AcademicWorkspaceSnapshot,
  CreateAcademicSessionRequest,
  CreateAcademicWorkspaceRequest,
  SaveTeachingAssignmentRequest,
  SetActiveAcademicContextRequest,
  UpdateTeachingAssignmentRequest,
} from "../domain/academicWorkspace";
import type { AssignCurriculumCourseRequest } from "../../curriculum-catalog/domain/curriculumCatalog";

export interface AcademicWorkspaceGateway {
  getSnapshot(): Promise<AcademicWorkspaceSnapshot>;
  createWorkspace(
    request: CreateAcademicWorkspaceRequest,
  ): Promise<AcademicWorkspaceSnapshot>;
  createSession(
    request: CreateAcademicSessionRequest,
  ): Promise<AcademicWorkspaceSnapshot>;
  addAssignment(
    request: SaveTeachingAssignmentRequest,
  ): Promise<AcademicWorkspaceSnapshot>;
  updateAssignment(
    request: UpdateTeachingAssignmentRequest,
  ): Promise<AcademicWorkspaceSnapshot>;
  archiveAssignment(assignmentId: string): Promise<AcademicWorkspaceSnapshot>;
  assignCurriculumCourse(
    request: AssignCurriculumCourseRequest,
  ): Promise<AcademicWorkspaceSnapshot>;
  setActiveContext(
    request: SetActiveAcademicContextRequest,
  ): Promise<AcademicWorkspaceSnapshot>;
}
