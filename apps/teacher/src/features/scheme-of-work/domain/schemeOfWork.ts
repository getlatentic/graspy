import { z } from "zod";

export const schemeWeekKindSchema = z.enum([
  "teaching",
  "revision",
  "test",
  "break",
  "examination",
]);
export type SchemeWeekKind = z.infer<typeof schemeWeekKindSchema>;

const curriculumFrameworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  authority: z.string().min(1),
  jurisdiction: z.string().min(1),
  version: z.string().min(1),
  sourceUri: z.string().nullable(),
});

const curriculumCourseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.string().min(1),
  framework: curriculumFrameworkSchema,
});

const schemeEntrySchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  topic: z.string().min(1),
  subtopic: z.string().nullable(),
  curriculumUnit: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
  }),
  curriculumOutcomes: z.array(
    z.object({ id: z.string().min(1), statement: z.string().min(1) }),
  ),
  objectives: z.array(z.string().min(1)),
  assessment: z.array(z.string().min(1)),
  instructionalMaterials: z.array(z.string().min(1)),
  notes: z.string().nullable(),
  /**
   * The lesson already written from this weekly plan, where there is one.
   *
   * A weekly plan carries at most one lesson, so this is what tells the term
   * plan whether to offer the way into a lesson or the way to start one.
   */
  plannedLessonId: z.string().nullable(),
});

const schemeWeekSchema = z.object({
  id: z.string().min(1),
  ordinal: z.number().int().positive(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  kind: schemeWeekKindSchema,
  title: z.string().nullable(),
  entries: z.array(schemeEntrySchema),
});

const schemeOfWorkSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originTemplateId: z.string().nullable(),
  academicSessionId: z.string().min(1),
  academicPeriodId: z.string().min(1),
  academicPeriodName: z.string().min(1),
  teachingAssignmentId: z.string().min(1),
  curriculum: curriculumCourseSchema,
  calendar: z.object({ startsOn: z.iso.date(), endsOn: z.iso.date() }),
  weeks: z.array(schemeWeekSchema),
});

const schemeTemplateSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  jurisdiction: z.string().min(1),
  edition: z.string().min(1),
  trust: z.enum(["verified", "school"]),
  origin: z.enum(["bundled", "imported"]),
  weekCount: z.number().int().positive(),
  planCount: z.number().int().nonnegative(),
  weeks: z.array(
    z.object({
      ordinal: z.number().int().positive(),
      kind: schemeWeekKindSchema,
      title: z.string().nullable(),
      topics: z.array(z.string().min(1)),
    }),
  ),
});

export const schemeContextSnapshotSchema = z.object({
  scheme: schemeOfWorkSchema.nullable(),
  availableTemplates: z.array(schemeTemplateSummarySchema),
});

export type SchemeContextSnapshot = z.infer<typeof schemeContextSnapshotSchema>;
export type SchemeOfWork = NonNullable<SchemeContextSnapshot["scheme"]>;
export type SchemeWeek = SchemeOfWork["weeks"][number];
export type SchemeEntry = SchemeWeek["entries"][number];
export type SchemeTemplateSummary = z.infer<
  typeof schemeTemplateSummarySchema
>;

export interface SchemeContextRequest {
  readonly academicSessionId: string;
  readonly academicPeriodId: string;
  readonly teachingAssignmentId: string;
}

/**
 * A term as a school keeps it: the day it resumes, the day it closes, and the
 * mid-term break between them. Not every term has a break, so both of its days
 * are absent together or present together.
 */
export interface TermDates {
  readonly termStartsOn: string;
  readonly termEndsOn: string;
  readonly midTermBreakStartsOn: string | null;
  readonly midTermBreakEndsOn: string | null;
}

export interface CreateSchemeOfWorkRequest extends TermDates {
  readonly context: SchemeContextRequest;
}

export interface CreateSchemeFromTemplateRequest extends TermDates {
  readonly context: SchemeContextRequest;
  readonly templateId: string;
}

export interface InstallSchemeTemplatePackageRequest {
  readonly context: SchemeContextRequest;
  readonly packageContents: string;
}

export interface SaveSchemeWeekRequest {
  readonly context: SchemeContextRequest;
  readonly weekId: string;
  readonly kind: SchemeWeekKind;
  readonly title: string | null;
}

export interface SaveSchemeEntryRequest {
  readonly context: SchemeContextRequest;
  readonly entryId: string | null;
  readonly weekId: string;
  readonly topic: string;
  readonly subtopic: string | null;
  readonly curriculumUnit: string;
  readonly curriculumOutcomes: string[];
  readonly objectives: string[];
  readonly assessment: string[];
  readonly instructionalMaterials: string[];
  readonly notes: string | null;
}

export interface ArchiveSchemeEntryRequest {
  readonly context: SchemeContextRequest;
  readonly entryId: string;
}

/**
 * Moving a subtopic to the week a teacher will actually teach it in.
 *
 * A class that falls behind has to be able to say so, because the scheme is
 * what the week's plan is written against.
 */
export interface MoveSchemeEntryRequest {
  readonly context: SchemeContextRequest;
  readonly entryId: string;
  readonly targetWeekId: string;
}

export function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function suggestedPeriodDates(
  sessionStartYear: number,
  periodOrdinal: number,
  periodCount: number,
): { startsOn: string; endsOn: string } {
  if (
    !Number.isInteger(periodOrdinal) ||
    !Number.isInteger(periodCount) ||
    periodOrdinal < 1 ||
    periodOrdinal > periodCount ||
    periodCount > 12
  ) {
    throw new Error("The academic period must belong to the selected session.");
  }
  const startOffset = Math.floor(((periodOrdinal - 1) * 12) / periodCount);
  const endOffset = Math.floor((periodOrdinal * 12) / periodCount);
  return {
    startsOn: dateKey(new Date(Date.UTC(sessionStartYear, 8 + startOffset, 1))),
    endsOn: dateKey(new Date(Date.UTC(sessionStartYear, 8 + endOffset, 0))),
  };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function currentOrFirstTeachingWeek(
  scheme: SchemeOfWork,
  today = new Date(),
): SchemeWeek {
  const todayKey = localDateKey(today);
  return (
    scheme.weeks.find(
      (week) => week.startsOn <= todayKey && week.endsOn >= todayKey,
    ) ??
    scheme.weeks.find((week) => week.kind === "teaching") ??
    scheme.weeks[0]
  );
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
