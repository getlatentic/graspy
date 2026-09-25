import { z } from "zod";

export const academicCalendarKindSchema = z.enum([
  "terms",
  "semesters",
  "quarters",
  "custom",
]);
export type AcademicCalendarKind = z.infer<typeof academicCalendarKindSchema>;

export const academicPeriodKindSchema = z.enum([
  "term",
  "semester",
  "quarter",
  "custom",
]);
export type AcademicPeriodKind = z.infer<typeof academicPeriodKindSchema>;

const schoolProfileSchema = z.object({
  jurisdictionId: z.string().min(1),
  jurisdiction: z.string().min(1),
  countryCode: z.string().length(2),
  gradeSystemId: z.string().min(1),
  gradeSystem: z.string().min(1),
});

const jurisdictionOptionSchema = z.object({
  id: z.string().min(1),
  countryCode: z.string().length(2),
  country: z.string().min(1),
  name: z.string().min(1),
});

const gradeSystemSchema = z.object({
  id: z.string().min(1),
  jurisdictionId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
});

const academicSessionSchema = z.object({
  id: z.string().min(1),
  startYear: z.number().int(),
  endYear: z.number().int(),
  label: z.string().min(1),
  status: z.enum(["open", "archived"]),
  calendarKind: academicCalendarKindSchema,
});

const academicPeriodSchema = z.object({
  id: z.string().min(1),
  academicSessionId: z.string().min(1),
  ordinal: z.number().int().min(1).max(12),
  name: z.string().min(1),
  kind: academicPeriodKindSchema,
});

const subjectOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const gradeLevelSchema = z.object({
  id: z.string().min(1),
  gradeSystemId: z.string().min(1),
  code: z.string().min(1),
  displayName: z.string().min(1),
});

const teachingAssignmentSchema = z.object({
  id: z.string().min(1),
  academicSessionId: z.string().min(1),
  subjectId: z.string().min(1),
  subject: z.string().min(1),
  gradeLevelId: z.string().min(1),
  gradeLevel: z.string().min(1),
  classSection: z.string().nullable(),
  displayName: z.string().min(1),
  curriculumCourseId: z.string().min(1).nullable().default(null),
  curriculumTitle: z.string().min(1).nullable().default(null),
  curriculumPublisher: z.string().min(1).nullable().default(null),
  curriculumTrust: z.enum(["verified", "school"]).nullable().default(null),
  status: z.enum(["active", "archived"]),
  lessonsTotal: z.number().int().nonnegative(),
  lessonsReady: z.number().int().nonnegative(),
  currentWeek: z
    .object({
      ordinal: z.number().int().positive(),
      title: z.string().nullish(),
      /** Where today sits against this term: in it, before it, or after it. */
      standing: z.enum(["thisWeek", "notStarted", "finished"]),
    })
    .nullish(),
  nextLesson: z
    .object({ topic: z.string(), subtopic: z.string().nullable() })
    .nullish(),
});

const academicWorkspaceSchema = z.object({
  school: schoolProfileSchema,
  sessions: z.array(academicSessionSchema),
  periods: z.array(academicPeriodSchema),
  assignments: z.array(teachingAssignmentSchema),
  activeSessionId: z.string().min(1),
  activePeriodId: z.string().min(1),
  activeAssignmentId: z.string().min(1),
});

export const academicWorkspaceSnapshotSchema = z.object({
  workspace: academicWorkspaceSchema.nullable(),
  subjects: z.array(subjectOptionSchema),
  gradeLevels: z.array(gradeLevelSchema),
  jurisdictions: z.array(jurisdictionOptionSchema),
  gradeSystems: z.array(gradeSystemSchema),
});

export type AcademicWorkspaceSnapshot = z.infer<
  typeof academicWorkspaceSnapshotSchema
>;
export type AcademicWorkspace = NonNullable<
  AcademicWorkspaceSnapshot["workspace"]
>;
export type AcademicSession = AcademicWorkspace["sessions"][number];
export type AcademicPeriod = AcademicWorkspace["periods"][number];
export type TeachingAssignment = AcademicWorkspace["assignments"][number];
export type GradeLevel = AcademicWorkspaceSnapshot["gradeLevels"][number];
export type JurisdictionOption = AcademicWorkspaceSnapshot["jurisdictions"][number];
export type GradeSystem = AcademicWorkspaceSnapshot["gradeSystems"][number];

export interface CreateAcademicWorkspaceRequest {
  readonly startYear: number;
  readonly jurisdictionId: string;
  readonly gradeSystemId: string;
  readonly calendarKind: AcademicCalendarKind;
  readonly periodNames: readonly string[];
  readonly activePeriodOrdinal: number;
  /** Everything the teacher said they teach. The first is where they land. */
  readonly assignments: readonly CreateTeachingAssignment[];
}

export interface CreateTeachingAssignment {
  readonly subject: string;
  readonly gradeLevelId: string;
  readonly classSection: string | null;
}

export interface CreateAcademicSessionRequest {
  readonly startYear: number;
  readonly calendarKind: AcademicCalendarKind;
  readonly periodNames: readonly string[];
  readonly activePeriodOrdinal: number;
  readonly subject: string;
  readonly gradeLevelId: string;
  readonly classSection: string | null;
}

export interface SaveTeachingAssignmentRequest {
  readonly academicSessionId: string;
  readonly subject: string;
  readonly gradeLevelId: string;
  readonly classSection: string | null;
}

export interface UpdateTeachingAssignmentRequest {
  readonly assignmentId: string;
  readonly subject: string;
  readonly gradeLevelId: string;
  readonly classSection: string | null;
}

export interface SetActiveAcademicContextRequest {
  readonly academicSessionId: string;
  readonly academicPeriodId: string;
  readonly assignmentId: string;
}

export const academicCalendarOptions: ReadonlyArray<{
  readonly value: AcademicCalendarKind;
  readonly label: string;
}> = [
  { value: "terms", label: "Terms" },
  { value: "semesters", label: "Semesters" },
  { value: "quarters", label: "Quarters" },
  { value: "custom", label: "Custom periods" },
];

export const defaultCalendarByCountry: Readonly<Record<string, AcademicCalendarKind>> = {
  NG: "terms",
  US: "semesters",
};

export function defaultPeriodNames(
  kind: AcademicCalendarKind,
  requestedCount?: number,
): string[] {
  const count = requestedCount ?? defaultPeriodCount(kind);
  if (kind === "semesters") return ["First semester", "Second semester"];
  if (kind === "quarters") {
    return ["First quarter", "Second quarter", "Third quarter", "Fourth quarter"];
  }
  if (kind === "terms") {
    return ordinalWords(count).map((word) => `${word} term`);
  }
  return Array.from({ length: count }, (_, index) => `Period ${index + 1}`);
}

function defaultPeriodCount(kind: AcademicCalendarKind): number {
  if (kind === "semesters") return 2;
  if (kind === "quarters") return 4;
  return 3;
}

export interface InferredAcademicContext {
  readonly startYear: number;
  readonly activePeriodOrdinal: number;
}

export function inferAcademicContext(
  date: Date,
  periodCount = 3,
  academicYearStartMonth = 9,
): InferredAcademicContext {
  if (
    !Number.isInteger(academicYearStartMonth) ||
    academicYearStartMonth < 1 ||
    academicYearStartMonth > 12
  ) {
    throw new Error("The academic-year start month must be between 1 and 12.");
  }
  if (!Number.isInteger(periodCount) || periodCount < 1 || periodCount > 12) {
    throw new Error("The academic calendar must contain between 1 and 12 periods.");
  }

  const calendarMonth = date.getMonth() + 1;
  const monthsSinceSessionStart =
    (calendarMonth - academicYearStartMonth + 12) % 12;
  const activePeriodOrdinal = Math.min(
    periodCount,
    Math.floor((monthsSinceSessionStart * periodCount) / 12) + 1,
  );

  return {
    startYear:
      calendarMonth >= academicYearStartMonth
        ? date.getFullYear()
        : date.getFullYear() - 1,
    activePeriodOrdinal,
  };
}

export function activeTeachingAssignment(
  workspace: AcademicWorkspace,
): TeachingAssignment {
  const assignment = workspace.assignments.find(
    ({ id }) => id === workspace.activeAssignmentId,
  );
  if (!assignment) {
    throw new Error("The active class is missing from the academic workspace.");
  }
  return assignment;
}

export function activeAcademicSession(
  workspace: AcademicWorkspace,
): AcademicSession {
  const session = workspace.sessions.find(
    ({ id }) => id === workspace.activeSessionId,
  );
  if (!session) {
    throw new Error("The active session is missing from the academic workspace.");
  }
  return session;
}

export function activeAcademicPeriod(workspace: AcademicWorkspace): AcademicPeriod {
  const period = workspace.periods.find(({ id }) => id === workspace.activePeriodId);
  if (!period) {
    throw new Error("The active academic period is missing from the workspace.");
  }
  return period;
}

export function periodsForSession(
  workspace: AcademicWorkspace,
  sessionId: string,
): AcademicPeriod[] {
  return workspace.periods.filter(
    (period) => period.academicSessionId === sessionId,
  );
}

export function assignmentsForSession(
  workspace: AcademicWorkspace,
  sessionId: string,
  includeArchived = false,
): TeachingAssignment[] {
  return workspace.assignments.filter(
    (assignment) =>
      assignment.academicSessionId === sessionId &&
      (includeArchived || assignment.status === "active"),
  );
}

function ordinalWords(count: number): string[] {
  const words = ["First", "Second", "Third", "Fourth"];
  return words.slice(0, count);
}

/**
 * What a class card says about where its term has got to.
 *
 * A term whose weeks have all ended used to fall back to its first week and
 * label it "WEEK 1", so a card read as though the term were starting eight
 * months after it closed. Each standing is now said in the teacher's words.
 */
export function termStandingLabel(week: {
  readonly ordinal: number;
  readonly standing: "thisWeek" | "notStarted" | "finished";
}): string {
  if (week.standing === "thisWeek") return `This week · Week ${week.ordinal}`;
  if (week.standing === "notStarted") return `Term starts at Week ${week.ordinal}`;
  return "Term finished";
}

/**
 * Whether this class has a term planned, and so what the card offers to do.
 *
 * A class with no weeks cannot hold a lesson against one, so planning the term
 * is the first step rather than one of several — and it was a label on the card
 * saying so with no way through, which left the first step of the journey
 * living inside the second screen.
 */
export function classCardAction(assignment: { readonly currentWeek?: unknown }): {
  readonly label: string;
  readonly kind: "openClass" | "planTerm";
} {
  return assignment.currentWeek
    ? { label: "Open class", kind: "openClass" }
    : { label: "Plan this term", kind: "planTerm" };
}
