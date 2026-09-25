import { z } from "zod";

import { granularLessonStepSchema } from "../../lesson-planning/domain/granularLesson";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";

export const classworkKindSchema = z.enum([
  "review",
  "worked_example",
  "practice",
  "solution",
]);

const classworkBlockSchema = z.object({
  id: z.string().min(1),
  kind: classworkKindSchema,
  text: z.string().min(1),
  learningGoalNumbers: z.array(z.number().int().positive()),
  sourceMaterialKeys: z.array(z.string().min(1)),
  teacherEdited: z.boolean(),
});

export const qualityCheckNameSchema = z.enum([
  "content_structure",
  "learning_goal_alignment",
  "scope_compliance",
  "source_presence",
  "source_validity",
  "unsupported_source_claims",
]);

export const qualityValidationStageSchema = z.enum(["initial", "repair", "scrub"]);

const qualityCheckSchema = z.object({
  check: qualityCheckNameSchema,
  passed: z.boolean(),
  details: z.array(z.string().min(1).max(500)).max(20),
});

const qualityValidationPassSchema = z.object({
  stage: qualityValidationStageSchema,
  passed: z.boolean(),
  checks: z.array(qualityCheckSchema).length(6),
});

export const classworkQualityReportSchema = z.object({
  outcome: z.enum(["passed", "repaired", "scrubbed", "failed"]),
  repairAttempted: z.boolean(),
  scrubbedClaimCount: z.number().int().nonnegative(),
  passes: z.array(qualityValidationPassSchema).min(1).max(3),
});

const classworkSectionSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  stepTitle: z.string().min(1),
  status: z.enum(["pending", "generating", "done", "failed"]),
  title: z.string().nullable(),
  learningGoalNumbers: z.array(z.number().int().positive()),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  quality: classworkQualityReportSchema.nullable(),
  regenerated: z.boolean(),
  blocks: z.array(classworkBlockSchema),
});

const classworkSourceSummarySchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  sourceUrl: z.url(),
  licenceName: z.string().min(1),
  licenceUrl: z.url(),
  attribution: z.string().min(1),
});

const classworkFigureSchema = z.object({
  id: z.string().min(1),
  sourceMaterialKey: z.string().min(1),
  sequence: z.number().int().positive(),
  caption: z.string().min(1),
  altText: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});

const confirmedLessonContextSchema = z.object({
  lessonId: z.string().min(1),
  lessonVersionId: z.string().min(1),
  lessonVersionNumber: z.number().int().positive(),
  subject: z.string().min(1),
  grade: z.string().min(1),
  topic: z.string().min(1),
  subtopic: z.string().nullable(),
  learningGoals: z.array(z.string().min(1)).min(1),
});

const classworkRunSchema = z.object({
  id: z.string().min(1),
  /** The task this run's work is registered under, as the backend names it. */
  taskId: z.string().min(1),
  status: z.enum(["running", "paused", "failed", "cancelled", "complete"]),
  lessonVersionId: z.string().min(1),
  lessonVersionNumber: z.number().int().positive(),
  documentVersion: z.object({
    id: z.string().min(1),
    versionNumber: z.number().int().positive(),
    status: z.enum(["draft", "approved"]),
    changeKind: z.enum(["initial", "teacher_edit", "section_regeneration", "section_restore"]),
    changedSectionId: z.string().nullable(),
    teacherDirection: z.string().nullable(),
    restoredFromVersionNumber: z.number().int().positive().nullable(),
    createdAt: z.string(),
    approvedAt: z.string().nullable(),
  }).nullable(),
  sectionRegeneration: z.object({
    id: z.string().min(1),
    sectionId: z.string().min(1),
    status: z.enum(["generating", "failed"]),
    teacherDirection: z.string().nullable(),
    lastError: z.string().nullable(),
  }).nullable().optional(),
  sources: z.array(classworkSourceSummarySchema),
  figures: z.array(classworkFigureSchema),
  sections: z.array(classworkSectionSchema).min(1),
});

export const classworkWorkspaceSchema = z.object({
  lesson: confirmedLessonContextSchema,
  run: classworkRunSchema.nullable(),
});

const sourceMaterialSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  publisher: z.string().min(1),
  sourceUrl: z.url(),
  licenceName: z.string().min(1),
  licenceUrl: z.url(),
  attribution: z.string().min(1),
});

const sectionJobSchema = z.object({
  runId: z.string().min(1),
  sectionId: z.string().min(1),
  generationToken: z.string().min(1),
  lesson: confirmedLessonContextSchema,
  step: z.object({
    sequence: z.number().int().positive(),
    title: z.string().min(1),
    teacherActivity: z.string().min(1),
    learnerActivity: z.string().min(1),
    durationMinutes: z.number().int().positive().nullable(),
    planStep: granularLessonStepSchema.nullable(),
  }),
  sourceMaterials: z.array(sourceMaterialSchema).max(3),
  regeneration: z.object({
    id: z.string().min(1),
    sourceVersionNumber: z.number().int().positive(),
    teacherDirection: z.string().nullable(),
    previousSection: z.object({
      title: z.string().min(1),
      learningGoalNumbers: z.array(z.number().int().positive()),
      blocks: z.array(classworkBlockSchema).length(4),
    }),
  }).nullable().optional(),
});

export const classworkSectionStartSchema = z.object({
  job: sectionJobSchema,
  workspace: classworkWorkspaceSchema,
});

export const classworkSectionHistorySchema = z.object({
  currentVersionNumber: z.number().int().positive(),
  versions: z.array(z.object({
    versionNumber: z.number().int().positive(),
    createdAt: z.string(),
    changeKind: z.enum(["initial", "teacher_edit", "section_regeneration", "section_restore"]),
    teacherDirection: z.string().nullable(),
    restoredFromVersionNumber: z.number().int().positive().nullable(),
    title: z.string().min(1),
    learningGoalNumbers: z.array(z.number().int().positive()),
    regenerated: z.boolean(),
    blocks: z.array(classworkBlockSchema).length(4),
  })).min(1),
});

export type ClassworkWorkspaceSnapshot = z.infer<typeof classworkWorkspaceSchema>;
export type ClassworkRun = NonNullable<ClassworkWorkspaceSnapshot["run"]>;
export type ClassworkSection = ClassworkRun["sections"][number];
export type ClassworkSourceSummary = ClassworkRun["sources"][number];
export type ClassworkFigure = ClassworkRun["figures"][number];
export type ClassworkKind = z.infer<typeof classworkKindSchema>;
export type ClassworkSectionJob = z.infer<typeof sectionJobSchema>;
export type ClassworkQualityCheckName = z.infer<typeof qualityCheckNameSchema>;
export type ClassworkQualityValidationStage = z.infer<typeof qualityValidationStageSchema>;
export type ClassworkQualityReport = z.infer<typeof classworkQualityReportSchema>;
export type ClassworkSectionHistory = z.infer<typeof classworkSectionHistorySchema>;

export interface GeneratedClassworkSection {
  readonly title: string;
  readonly learningGoalNumbers: number[];
  readonly blocks: Array<{
    readonly kind: ClassworkKind;
    readonly text: string;
    readonly learningGoalNumbers: number[];
    readonly sourceMaterialKeys: string[];
  }>;
  readonly quality: ClassworkQualityReport;
}

export interface ClassworkWorkspaceRequest { readonly context: LessonContextRequest; readonly lessonId: string }
export interface RunClassworkGenerationRequest extends ClassworkWorkspaceRequest { readonly sectionId?: string | null }
export interface StartClassworkRunRequest extends ClassworkWorkspaceRequest {}
export interface BeginClassworkSectionRequest { readonly context: LessonContextRequest; readonly runId: string; readonly sectionId: string | null }
export interface CompleteClassworkSectionRequest extends BeginClassworkSectionRequest { readonly sectionId: string; readonly generationToken: string; readonly section: GeneratedClassworkSection }
export interface FailClassworkSectionRequest { readonly context: LessonContextRequest; readonly runId: string; readonly sectionId: string; readonly generationToken: string; readonly message: string; readonly quality: ClassworkQualityReport | null }
export interface CancelClassworkRunRequest extends Omit<FailClassworkSectionRequest, "message" | "quality"> {}
export interface ClassworkFigureRequest extends ClassworkWorkspaceRequest { readonly figureId: string }
export interface EditClassworkBlockRequest {
  readonly context: LessonContextRequest;
  readonly runId: string;
  readonly blockId: string;
  readonly expectedVersionNumber: number;
  readonly text: string;
}
export interface ApproveClassworkVersionRequest {
  readonly context: LessonContextRequest;
  readonly runId: string;
  readonly expectedVersionNumber: number;
}
export interface BeginClassworkSectionRegenerationRequest {
  readonly context: LessonContextRequest;
  readonly runId: string;
  readonly sectionId: string;
  readonly expectedVersionNumber: number;
  readonly teacherDirection: string | null;
}
export interface CompleteClassworkSectionRegenerationRequest {
  readonly context: LessonContextRequest;
  readonly runId: string;
  readonly regenerationId: string;
  readonly sectionId: string;
  readonly generationToken: string;
  readonly section: GeneratedClassworkSection;
}
export interface FailClassworkSectionRegenerationRequest extends Omit<CompleteClassworkSectionRegenerationRequest, "section"> {
  readonly message: string;
}
export interface CancelClassworkSectionRegenerationRequest extends Omit<CompleteClassworkSectionRegenerationRequest, "section"> {}
export interface ClassworkSectionHistoryRequest {
  readonly context: LessonContextRequest;
  readonly runId: string;
  readonly sectionId: string;
}
export interface RestoreClassworkSectionRequest extends ClassworkSectionHistoryRequest {
  readonly sourceVersionNumber: number;
  readonly expectedVersionNumber: number;
}
