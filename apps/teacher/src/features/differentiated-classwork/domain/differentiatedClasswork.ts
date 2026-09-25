import { z } from "zod";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import { classworkKindSchema } from "../../classwork/domain/classwork";

const learningGoalStateSchema = z.object({
  learningGoalNumber: z.number().int().positive(),
  learningGoal: z.string().min(1),
  masteryBand: z.enum(["remediate", "reinforce", "extend"]),
  mastery: z.string().min(1),
  confidence: z.string().nullable(),
  perceivedDifficulty: z.string().nullable(),
  commonMisunderstanding: z.string().nullable(),
});

const sessionSignalsSchema = z.object({
  interest: z.string().nullable(),
  lessonFeeling: z.string().nullable(),
});

const sourceMaterialSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
});

const baseBlockSchema = z.object({
  id: z.string().min(1),
  kind: classworkKindSchema,
  text: z.string().min(1),
  learningGoalNumbers: z.array(z.number().int().positive()).min(1),
  sourceMaterialKeys: z.array(z.string().min(1)),
  teacherEdited: z.boolean(),
});

const generatedBlockSchema = z.object({
  id: z.string().min(1),
  baseBlockId: z.string().min(1),
  kind: classworkKindSchema,
  text: z.string().min(1),
  learningGoalNumbers: z.array(z.number().int().positive()).min(1),
  sourceMaterialKeys: z.array(z.string().min(1)),
});

const baseSectionSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  stepTitle: z.string().min(1),
  title: z.string().min(1),
  learningGoalNumbers: z.array(z.number().int().positive()).min(1),
  blocks: z.array(baseBlockSchema).length(4),
});

export const differentiatedQualityCheckNameSchema = z.enum([
  "content_structure",
  "learning_goal_preservation",
  "block_alignment",
  "source_scope",
  "differentiation_presence",
  "unsupported_claims",
]);

const qualityCheckSchema = z.object({
  check: differentiatedQualityCheckNameSchema,
  passed: z.boolean(),
  details: z.array(z.string().min(1).max(500)).max(20),
});

const qualityPassSchema = z.object({
  stage: z.enum(["initial", "repair", "scrub"]),
  passed: z.boolean(),
  checks: z.array(qualityCheckSchema).length(6),
});

export const differentiatedQualityReportSchema = z.object({
  outcome: z.enum(["passed", "repaired", "scrubbed", "failed"]),
  repairAttempted: z.boolean(),
  scrubbedClaimCount: z.number().int().nonnegative(),
  passes: z.array(qualityPassSchema).min(1).max(3),
});

const sectionSchema = z.object({
  id: z.string().min(1),
  baseSectionId: z.string().min(1),
  sequence: z.number().int().positive(),
  stepTitle: z.string().min(1),
  status: z.enum(["pending", "generating", "done", "failed"]),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  title: z.string().nullable(),
  learningGoalNumbers: z.array(z.number().int().positive()),
  quality: differentiatedQualityReportSchema.nullable(),
  baseSection: baseSectionSchema,
  blocks: z.array(generatedBlockSchema),
});

const groupSchema = z.object({
  id: z.string().min(1),
  evidenceGroupId: z.string().min(1),
  position: z.number().int().min(1).max(3),
  name: z.string().min(1).max(80),
  learnerState: z.array(learningGoalStateSchema).min(1),
  sessionSignals: sessionSignalsSchema,
  sections: z.array(sectionSchema).min(1),
});

const runSchema = z.object({
  id: z.string().min(1),
  /** The task this run's work is registered under, as the backend names it. */
  taskId: z.string().min(1),
  status: z.enum(["paused", "running", "failed", "cancelled", "complete"]),
  baseRunId: z.string().min(1),
  evidenceSetId: z.string().min(1),
  evidenceRevision: z.number().int().positive(),
  groups: z.array(groupSchema).length(3),
});

export const differentiatedClassworkWorkspaceSchema = z.object({
  lesson: z.object({
    lessonId: z.string().min(1),
    lessonVersionId: z.string().min(1),
    lessonVersionNumber: z.number().int().positive(),
    subject: z.string().min(1),
    grade: z.string().min(1),
    topic: z.string().min(1),
    subtopic: z.string().nullable(),
    learningGoals: z.array(z.string().min(1)).min(1),
  }),
  readiness: z.object({
    canStart: z.boolean(),
    blockers: z.array(z.string().min(1)),
  }),
  run: runSchema.nullable(),
});

const sectionJobSchema = z.object({
  runId: z.string().min(1),
  groupId: z.string().min(1),
  sectionId: z.string().min(1),
  generationToken: z.string().min(1),
  lesson: z.object({
    topic: z.string().min(1),
    learningGoals: z.array(z.string().min(1)).min(1),
  }),
  group: z.object({
    name: z.string().min(1),
    learningGoals: z.array(learningGoalStateSchema).min(1),
    sessionSignals: sessionSignalsSchema,
  }),
  baseSection: baseSectionSchema,
  sourceMaterials: z.array(sourceMaterialSchema).max(12),
});

export const differentiatedClassworkSectionStartSchema = z.object({
  job: sectionJobSchema,
  workspace: differentiatedClassworkWorkspaceSchema,
});

export type DifferentiatedClassworkWorkspaceSnapshot = z.infer<typeof differentiatedClassworkWorkspaceSchema>;
export type DifferentiatedClassworkRun = NonNullable<DifferentiatedClassworkWorkspaceSnapshot["run"]>;
export type DifferentiatedClassworkGroup = DifferentiatedClassworkRun["groups"][number];
export type DifferentiatedClassworkSection = DifferentiatedClassworkGroup["sections"][number];
export type DifferentiatedClassworkSectionJob = z.infer<typeof sectionJobSchema>;
export type DifferentiatedClassworkSectionStart = z.infer<typeof differentiatedClassworkSectionStartSchema>;
export type DifferentiatedClassworkBaseSection = z.infer<typeof baseSectionSchema>;
export type DifferentiatedClassworkQualityReport = z.infer<typeof differentiatedQualityReportSchema>;
export type DifferentiatedClassworkQualityCheckName = z.infer<typeof differentiatedQualityCheckNameSchema>;
export type DifferentiatedClassworkQualityStage = DifferentiatedClassworkQualityReport["passes"][number]["stage"];

export interface GeneratedDifferentiatedClassworkSection {
  readonly title: string;
  readonly learningGoalNumbers: number[];
  readonly blocks: Array<{
    readonly kind: z.infer<typeof classworkKindSchema>;
    readonly text: string;
    readonly learningGoalNumbers: number[];
    readonly sourceMaterialKeys: string[];
  }>;
  readonly quality: DifferentiatedClassworkQualityReport;
}

export interface DifferentiatedWorkspaceRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
}

export interface RunDifferentiatedGenerationRequest extends DifferentiatedWorkspaceRequest { readonly sectionId?: string | null }

export interface StartDifferentiatedRunRequest extends DifferentiatedWorkspaceRequest {}
export interface BeginDifferentiatedSectionRequest {
  readonly context: LessonContextRequest;
  readonly runId: string;
  readonly sectionId: string | null;
}
export interface CompleteDifferentiatedSectionRequest extends BeginDifferentiatedSectionRequest {
  readonly groupId: string;
  readonly sectionId: string;
  readonly generationToken: string;
  readonly section: GeneratedDifferentiatedClassworkSection;
}
export interface FailDifferentiatedSectionRequest extends Omit<CompleteDifferentiatedSectionRequest, "section"> {
  readonly message: string;
  readonly quality: DifferentiatedClassworkQualityReport | null;
}
export interface CancelDifferentiatedRunRequest extends Omit<FailDifferentiatedSectionRequest, "message" | "quality"> {}
