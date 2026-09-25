import { z } from "zod";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";

export const evidenceStatusSchema = z.enum(["draft", "complete"]);

const evidenceEntrySchema = z.object({
  learningGoalNumber: z.number().int().positive(),
  questionsCorrect: z.number().int().nonnegative().nullable(),
  questionsTotal: z.number().int().positive().nullable(),
  misunderstandingNote: z.string().nullable(),
  confidenceScore: z.number().int().min(1).max(5).nullable(),
  difficultyScore: z.number().int().min(1).max(5).nullable(),
});

const evidenceGroupSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(1).max(3),
  name: z.string().min(1).max(80),
  interestScore: z.number().int().min(1).max(5).nullable(),
  lessonFeelingScore: z.number().int().min(1).max(5).nullable(),
  entries: z.array(evidenceEntrySchema),
});

export const lessonEvidenceWorkspaceSchema = z.object({
  lesson: z.object({
    lessonId: z.string().min(1),
    lessonVersionId: z.string().min(1),
    lessonVersionNumber: z.number().int().positive(),
    topic: z.string().min(1),
    learningGoals: z.array(z.string().min(1)).min(1),
  }),
  evidence: z.object({
    id: z.string().min(1),
    status: evidenceStatusSchema,
    revision: z.number().int().positive(),
    groups: z.array(evidenceGroupSchema).length(3),
  }).nullable(),
});

export type LessonEvidenceWorkspaceSnapshot = z.infer<typeof lessonEvidenceWorkspaceSchema>;
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type SavedEvidenceGroup = z.infer<typeof evidenceGroupSchema>;

export interface LessonEvidenceWorkspaceRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
}

export interface EvidenceEntryInput {
  readonly learningGoalNumber: number;
  readonly questionsCorrect: number | null;
  readonly questionsTotal: number | null;
  readonly misunderstandingNote: string | null;
  readonly confidenceScore: number | null;
  readonly difficultyScore: number | null;
}

export interface EvidenceGroupInput {
  readonly id: string | null;
  readonly position: number;
  readonly name: string;
  readonly interestScore: number | null;
  readonly lessonFeelingScore: number | null;
  readonly entries: EvidenceEntryInput[];
}

export interface SaveLessonEvidenceRequest extends LessonEvidenceWorkspaceRequest {
  readonly lessonVersionId: string;
  readonly expectedRevision: number | null;
  readonly status: EvidenceStatus;
  readonly groups: EvidenceGroupInput[];
}

const defaultGroupNames = ["Needs support", "Developing", "Secure"] as const;

export function editableGroups(snapshot: LessonEvidenceWorkspaceSnapshot): EvidenceGroupInput[] {
  const existing = snapshot.evidence?.groups;
  return defaultGroupNames.map((defaultName, index) => {
    const saved = existing?.[index];
    return {
      id: saved?.id ?? null,
      position: index + 1,
      name: saved?.name ?? defaultName,
      interestScore: saved?.interestScore ?? null,
      lessonFeelingScore: saved?.lessonFeelingScore ?? null,
      entries: snapshot.lesson.learningGoals.map((_, goalIndex) => {
        const entry = saved?.entries.find(({ learningGoalNumber }) => learningGoalNumber === goalIndex + 1);
        return entry ?? {
          learningGoalNumber: goalIndex + 1,
          questionsCorrect: null,
          questionsTotal: null,
          misunderstandingNote: null,
          confidenceScore: null,
          difficultyScore: null,
        };
      }),
    };
  });
}

export function evidenceValidation(groups: EvidenceGroupInput[], requireAllScores: boolean): string | null {
  const names = groups.map(({ name }) => name.trim().toLocaleLowerCase());
  if (names.some((name) => !name || name.length > 80)) return "Name all three teaching groups.";
  if (new Set(names).size !== 3) return "Give each teaching group a different name.";
  for (const group of groups) {
    for (const score of [group.interestScore, group.lessonFeelingScore]) {
      if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
        return `Check the overall lesson ratings for ${group.name}.`;
      }
    }
    for (const entry of group.entries) {
      const pairIsPartial = (entry.questionsCorrect === null) !== (entry.questionsTotal === null);
      if (pairIsPartial) return `Record both correct and total for ${group.name}.`;
      if (entry.questionsCorrect !== null && entry.questionsTotal !== null &&
          (entry.questionsTotal < 1 || entry.questionsTotal > 1000 || entry.questionsCorrect < 0 || entry.questionsCorrect > entry.questionsTotal)) {
        return `Check the score for ${group.name}. Correct cannot be greater than total.`;
      }
      if (requireAllScores && entry.questionsCorrect === null) return "Record a score for every group and learning goal before finishing.";
    }
  }
  return null;
}
