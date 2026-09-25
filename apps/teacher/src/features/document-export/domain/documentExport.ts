import { z } from "zod";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";

export const exportClassworkSetSchema = z.enum(["original", "group"]);
export const exportCopySchema = z.enum(["student", "teacher"]);

export const preparedClassworkExportSchema = z.object({
  title: z.string().min(1),
  fileName: z.string().min(1).endsWith(".pdf"),
  html: z.string().startsWith("<!doctype html>"),
});

export const classworkPdfArtifactSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1).endsWith(".pdf"),
  byteSize: z.number().int().min(1024),
});

export type ExportClassworkSet = z.infer<typeof exportClassworkSetSchema>;
export type ExportCopy = z.infer<typeof exportCopySchema>;
export type PreparedClassworkExport = z.infer<typeof preparedClassworkExportSchema>;
export type ClassworkPdfArtifact = z.infer<typeof classworkPdfArtifactSchema>;

export interface PrepareClassworkExportRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly classworkSet: ExportClassworkSet;
  readonly groupId: string | null;
  readonly copy: ExportCopy;
}

export interface SaveClassworkPdfRequest {
  readonly document: PrepareClassworkExportRequest;
  readonly destinationPath: string;
}

export interface ExportClassworkTarget {
  readonly id: string;
  readonly name: string;
}

export interface LessonPlanExportStep {
  readonly title: string;
  readonly teacherActivity: string;
  readonly learnerActivity: string;
  readonly durationMinutes: number | null;
}

/**
 * Which lesson a plan is for, in the terms the top of a lesson plan states it.
 *
 * A period and a duration are absent rather than invented: graspy models no
 * timetable, and a lesson whose steps carry no minutes has no length to state.
 */
export interface LessonPlanIdentity {
  readonly week: string | null;
  readonly className: string;
  readonly subject: string;
  readonly period: string | null;
  readonly duration: string | null;
}

/**
 * The finished plan, as the document a school reads.
 *
 * Its sections are named for the headings on that paper — objectives,
 * instructional materials, previous knowledge, presentation, evaluation,
 * assignment — because the export is what makes the app worth using in place of
 * a notebook, and a heading under another name has to be translated by hand.
 */
export interface LessonPlanExportInput {
  readonly title: string;
  readonly subtitle: string;
  readonly eyebrow: string;
  readonly identity: LessonPlanIdentity;
  readonly objectives: readonly string[];
  readonly instructionalMaterials: readonly string[];
  readonly previousKnowledge: readonly string[];
  readonly steps: readonly LessonPlanExportStep[];
  readonly evaluation: readonly string[];
  readonly assignment: readonly string[];
  readonly references: readonly string[];
}

export interface SaveLessonPlanPdfRequest {
  readonly document: LessonPlanExportInput;
  readonly destinationPath: string;
}
