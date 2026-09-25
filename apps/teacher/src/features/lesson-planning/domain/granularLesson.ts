import { z } from "zod";

export const lessonPlanFormatSchema = z.enum(["legacy_import", "granular"]);
export const knowledgeTypeSchema = z.enum([
  "concept",
  "procedure",
  "representation",
]);
export const bloomLevelSchema = z.enum([
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);
export const lessonStepRoleSchema = z.enum([
  "introduction",
  "core",
  "evaluation",
]);

const identifier = z.string().trim().min(1);
const positiveSequence = z.number().int().positive();

export const curriculumObjectiveSchema = z
  .object({
    id: identifier,
    statement: identifier,
    sequence: positiveSequence,
  })
  .strict();

export const atomicObjectiveSchema = z
  .object({
    id: identifier,
    curriculumObjectiveId: identifier,
    statement: identifier,
    bloomVerb: identifier,
    bloomLevel: bloomLevelSchema,
    sequence: positiveSequence,
  })
  .strict();

export const knowledgeComponentSchema = z
  .object({
    id: identifier,
    description: identifier,
    knowledgeType: knowledgeTypeSchema,
    bloomLevel: bloomLevelSchema,
    atomicObjectiveIds: z.array(identifier).min(1),
    prerequisiteKnowledgeComponentIds: z.array(identifier),
    supportingRecordIds: z.array(identifier).min(1),
    sourceForm: z.string().nullable(),
    targetForm: z.string().nullable(),
    isPriorKnowledge: z.boolean(),
  })
  .strict();

export const lessonObjectiveSchema = z
  .object({
    id: identifier,
    statement: identifier,
    sequence: positiveSequence,
    curriculumObjectiveId: identifier,
    atomicObjectiveId: identifier,
    knowledgeComponentId: identifier,
  })
  .strict();

export const misconceptionSchema = z
  .object({
    id: identifier,
    statement: identifier,
    correction: identifier,
    knowledgeComponentIds: z.array(identifier).min(1),
    supportingRecordIds: z.array(identifier).min(1),
  })
  .strict();

export const priorKnowledgeItemSchema = z
  .object({
    id: identifier,
    statement: identifier,
    knowledgeComponentIds: z.array(identifier).min(1),
    supportingRecordIds: z.array(identifier).min(1),
  })
  .strict();

export const lessonReferenceSchema = z
  .object({
    recordId: identifier,
    title: identifier,
    attribution: identifier,
  })
  .strict();

const explanationBlockSchema = z
  .object({
    type: z.literal("explanation"),
    id: identifier,
    content: identifier,
  })
  .strict();

const workedExampleBlockSchema = z
  .object({
    type: z.literal("worked_example"),
    id: identifier,
    problem: identifier,
    steps: z
      .array(
        z
          .object({
            label: identifier,
            content: identifier,
          })
          .strict(),
      )
      .min(1),
    finalAnswer: identifier,
  })
  .strict();

const practiceBlockSchema = z
  .object({
    type: z.literal("practice"),
    id: identifier,
    lessonObjectiveId: identifier,
    question: identifier,
    expectedAnswer: identifier,
    hints: z.array(identifier),
  })
  .strict();

const visualBlockSchema = z
  .object({
    type: z.literal("visual"),
    id: identifier,
    sourceRecordId: identifier,
    assetFileName: identifier,
    figureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    caption: identifier,
    altText: identifier,
  })
  .strict();

export const lessonContentBlockSchema = z.discriminatedUnion("type", [
  explanationBlockSchema,
  workedExampleBlockSchema,
  practiceBlockSchema,
  visualBlockSchema,
]);

export const granularLessonStepSchema = z
  .object({
    id: identifier,
    sequence: positiveSequence,
    role: lessonStepRoleSchema,
    title: identifier,
    summary: identifier,
    durationMinutes: z.number().int().positive(),
    lessonObjectiveId: identifier.nullable(),
    knowledgeType: knowledgeTypeSchema.nullable(),
    teacherActivities: z.array(identifier).min(1),
    learnerActivities: z.array(identifier).min(1),
    blocks: z.array(lessonContentBlockSchema),
  })
  .strict();

export const assessmentItemSchema = z
  .object({
    id: identifier,
    lessonObjectiveId: identifier,
    knowledgeComponentId: identifier,
    question: identifier,
    expectedAnswer: identifier,
    bloomLevel: bloomLevelSchema,
    rubric: z.array(identifier).min(1),
    supportingRecordIds: z.array(identifier).min(1),
  })
  .strict();

export const granularLessonPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    topic: identifier.max(160),
    subtopic: z.string().nullable(),
    curriculumObjectives: z.array(curriculumObjectiveSchema).min(1),
    atomicObjectives: z.array(atomicObjectiveSchema).min(1),
    lessonObjectives: z.array(lessonObjectiveSchema).min(1),
    knowledgeComponents: z.array(knowledgeComponentSchema).min(1),
    misconceptions: z.array(misconceptionSchema),
    priorKnowledge: z.array(priorKnowledgeItemSchema),
    /**
     * The teacher's own aids, under the key the record was sealed with.
     *
     * A confirmed plan is hashed and held immutable, so this key cannot be
     * rewritten and is not renamed. Everything downstream reads
     * `instructionalMaterials`; `lessonContentFromGranular` is where it changes.
     */
    materials: z.array(identifier).min(1),
    references: z.array(lessonReferenceSchema).min(1),
    steps: z.array(granularLessonStepSchema).min(3),
    assessments: z.array(assessmentItemSchema).min(1),
  })
  .strict();

export const curriculumSnapshotSchema = z
  .object({
    packageId: identifier.nullable(),
    packageTitle: identifier.nullable(),
    packageSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    courseId: identifier.nullable(),
    curriculumNodeId: identifier.nullable(),
    objectives: z.array(curriculumObjectiveSchema).min(1),
    atomicObjectives: z.array(atomicObjectiveSchema).min(1),
    knowledgeComponents: z.array(knowledgeComponentSchema).min(1),
  })
  .strict();

const sourceEvidenceRecordSchema = z
  .object({
    recordId: identifier,
    title: identifier,
    excerpt: identifier,
    excerptSha256: z.string().regex(/^[a-f0-9]{64}$/),
    attribution: identifier,
  })
  .strict();

const sourceEvidenceFigureSchema = z
  .object({
    sourceRecordId: identifier,
    assetFileName: identifier,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    caption: identifier,
    altText: identifier,
  })
  .strict();

export const sourceEvidenceSnapshotSchema = z
  .object({
    records: z.array(sourceEvidenceRecordSchema).min(1),
    figures: z.array(sourceEvidenceFigureSchema),
  })
  .strict();

export const lessonProgramSnapshotSchema = z
  .object({
    programId: identifier,
    programVersion: identifier,
    programDigest: z.string().regex(/^[a-f0-9]{64}$/),
    programRunId: identifier.nullable(),
  })
  .strict();

export const granularLessonRecordSchema = z
  .object({
    plan: granularLessonPlanSchema,
    curriculumSnapshot: curriculumSnapshotSchema,
    sourceEvidenceSnapshot: sourceEvidenceSnapshotSchema,
    programSnapshot: lessonProgramSnapshotSchema,
  })
  .strict();

export const granularLessonProgramInputSchema = z
  .object({
    topic: identifier.max(160),
    subtopic: z.string().nullable(),
    teacherSource: z.string().nullable(),
    lessonDurationMinutes: z.number().int().min(30).max(240),
    curriculumSnapshot: curriculumSnapshotSchema,
    sourceEvidenceSnapshot: sourceEvidenceSnapshotSchema,
  })
  .strict();

export type GranularLessonRecord = z.infer<typeof granularLessonRecordSchema>;
export type GranularLessonPlan = z.infer<typeof granularLessonPlanSchema>;
export type GranularLessonStep = z.infer<typeof granularLessonStepSchema>;
export type LessonContentBlock = z.infer<typeof lessonContentBlockSchema>;
export type GranularLessonProgramInput = z.infer<
  typeof granularLessonProgramInputSchema
>;
