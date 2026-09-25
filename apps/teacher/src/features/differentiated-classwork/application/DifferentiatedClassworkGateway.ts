import type {
  DifferentiatedClassworkWorkspaceSnapshot,
  DifferentiatedWorkspaceRequest,
  RunDifferentiatedGenerationRequest,
} from "../domain/differentiatedClasswork";

/**
 * The backend runs the adaptation; this gateway starts it, watches it, and
 * relays the teacher's decision to stop. Nothing here holds the work.
 */
export interface DifferentiatedClassworkGateway {
  getWorkspace(request: DifferentiatedWorkspaceRequest): Promise<DifferentiatedClassworkWorkspaceSnapshot>;
  runGeneration(request: RunDifferentiatedGenerationRequest): Promise<DifferentiatedClassworkWorkspaceSnapshot>;
  cancelGeneration(taskId: string): Promise<void>;
}
