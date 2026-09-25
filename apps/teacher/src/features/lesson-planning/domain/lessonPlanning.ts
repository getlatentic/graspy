import { z } from "zod";

import {
  granularLessonRecordSchema,
  lessonPlanFormatSchema,
  type GranularLessonRecord,
  type GranularLessonProgramInput,
} from "./granularLesson";
import { lessonContentSchema, type LessonContent } from "./lessonContent";
import { studentNoteSchema, type StudentNote } from "./studentNote";

export const lessonInputModeSchema = z.enum(["structured", "pasted"]);
export const lessonStatusSchema = z.enum(["draft", "confirmed"]);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;

const curriculumUnitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

const curriculumOutcomeSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
});

const lessonStepSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  teacherActivity: z.string().min(1),
  learnerActivity: z.string().min(1),
  durationMinutes: z.number().int().positive().nullable(),
});

/** What graspy's own checks found in a lesson's answers. */
const answerReportSchema = z.object({
  checked: z.number().int().nonnegative(),
  unchecked: z.number().int().nonnegative(),
  wrong: z.array(
    z.object({ question: z.string().min(1), problem: z.string().min(1) }),
  ),
});

const lessonPreparationSchema = z.object({
  lessonId: z.string().min(1),
  sourceRawPlan: z.string().min(1),
  topic: z.string().min(1),
  subtopic: z.string().nullable(),
  learningGoals: z.array(z.string().min(1)),
  steps: z.array(lessonStepSchema),
  instructionalMaterials: z.array(z.string().min(1)),
  previousKnowledge: z.array(z.string().min(1)),
  assessment: z.array(z.string().min(1)),
  references: z.array(z.string().min(1)),
  planFormat: lessonPlanFormatSchema,
  granularRecord: granularLessonRecordSchema.nullable(),
  answerReport: answerReportSchema.nullable(),
});

const lessonDraftSchema = z.object({
  id: z.string().min(1),
  academicSessionId: z.string().min(1),
  academicPeriodId: z.string().min(1),
  academicPeriodName: z.string().min(1),
  teachingAssignmentId: z.string().min(1),
  schemeWeekId: z.string().nullable(),
  schemeEntryId: z.string().nullable(),
  inputMode: lessonInputModeSchema,
  planFormat: lessonPlanFormatSchema,
  topic: z.string().min(1),
  subtopic: z.string().nullable(),
  rawPlan: z.string().nullable(),
  sourcePlanText: z.string().nullable(),
  learningGoals: z.array(z.string().min(1)),
  steps: z.array(lessonStepSchema),
  instructionalMaterials: z.array(z.string().min(1)),
  previousKnowledge: z.array(z.string().min(1)),
  assessment: z.array(z.string().min(1)),
  assignment: z.array(z.string().min(1)),
  references: z.array(z.string().min(1)),
  curriculumUnit: curriculumUnitSchema.nullable(),
  curriculumOutcomes: z.array(curriculumOutcomeSchema),
  status: lessonStatusSchema,
  latestVersionNumber: z.number().int().nonnegative(),
  preparation: lessonPreparationSchema.nullable(),
  granularRecord: granularLessonRecordSchema.nullable(),
  answerReport: answerReportSchema.nullable(),
  authoredContent: lessonContentSchema.nullish(),
  studentNote: studentNoteSchema.nullish(),
});

const schemeEntryOptionSchema = z.object({
  weekId: z.string().min(1),
  weekOrdinal: z.number().int().positive(),
  entryId: z.string().min(1),
  topic: z.string().min(1),
  subtopic: z.string().nullable(),
  curriculumUnit: curriculumUnitSchema,
  curriculumOutcomes: z.array(curriculumOutcomeSchema),
  learningGoals: z.array(z.string().min(1)),
  assessment: z.array(z.string().min(1)),
  instructionalMaterials: z.array(z.string().min(1)),
});

export const lessonWorkspaceSnapshotSchema = z.object({
  lessons: z.array(
    z.object({
      id: z.string().min(1),
      topic: z.string().min(1),
      subtopic: z.string().nullable(),
      status: lessonStatusSchema,
      inputMode: lessonInputModeSchema,
      planFormat: lessonPlanFormatSchema,
      latestVersionNumber: z.number().int().nonnegative(),
      weekOrdinal: z.number().int().positive().nullable(),
      schemeEntryId: z.string().nullable(),
      /** Whether every part of this lesson's classwork is written. */
      classworkComplete: z.boolean(),
      /** When the teacher started this lesson, as the library recorded it. */
      startedAt: z.string().min(1),
    }),
  ),
  selectedLesson: lessonDraftSchema.nullable(),
  availableSchemeEntries: z.array(schemeEntryOptionSchema),
});

export type LessonWorkspaceSnapshot = z.infer<typeof lessonWorkspaceSnapshotSchema>;
export type LessonDraft = NonNullable<LessonWorkspaceSnapshot["selectedLesson"]>;
export type LessonSchemeEntryOption = z.infer<typeof schemeEntryOptionSchema>;

export interface SchemeEntryLabel {
  readonly headline: string;
  /** Absent when the headings above the row have already said it. */
  readonly context?: string;
}

export interface AssessmentPrompt {
  /** The goal the question checks, when the question states it before asking. */
  readonly objective: string | null;
  readonly question: string;
}

/**
 * The question a check actually asks, apart from the goal it restates.
 *
 * A generated check reads "Count in millions. What is the number that
 * represents one million in digits only?" — the goal, then the question. Down a
 * list of eleven the goal repeats and the questions are what a teacher is
 * scanning for, so they lead and the goal becomes a quiet label beside them.
 * A sentence break is a full stop followed by a space, which leaves decimals
 * like 1.5 million alone.
 */
export function assessmentPrompt(text: string): AssessmentPrompt {
  const trimmed = text.trim();
  const boundary = trimmed.indexOf(". ");
  if (boundary === -1) return { objective: null, question: trimmed };
  const objective = trimmed.slice(0, boundary).trim();
  const question = trimmed.slice(boundary + 2).trim();
  if (!objective || !question) return { objective: null, question: trimmed };
  return { objective, question };
}

/** The excerpt titles that share one attribution, on the way to its source. */
interface ReferenceGroup {
  readonly attribution: string;
  readonly titles: readonly string[];
}

export interface ReferenceSource {
  /** The book, as a teacher would name it — the head of the attribution. */
  readonly textbook: string;
  /** The chapter the cited excerpts come from, when their numbering shows it. */
  readonly chapter: string | null;
  readonly attribution: string;
}

/** A "1.8" or "1.10" in an excerpt title reads chapter 1. */
const CHAPTER_IN_TITLE = /\b(\d+)\.\d+/;

function chapterLabel(titles: readonly string[]): string | null {
  const chapters = [
    ...new Set(
      titles
        .map((title) => title.match(CHAPTER_IN_TITLE)?.[1])
        .filter((chapter): chapter is string => Boolean(chapter))
        .map(Number),
    ),
  ].sort((a, b) => a - b);
  if (chapters.length === 0) return null;
  if (chapters.length === 1) return `Chapter ${chapters[0]}`;
  return `Chapters ${chapters[0]}–${chapters[chapters.length - 1]}`;
}

/**
 * References read as the source a teacher would cite, not every excerpt of it.
 *
 * A teacher wants to know the lesson draws on their textbook, and which chapter
 * — not the title of each of the eleven excerpts graspy pulled from it. So the
 * book is named once (the head of the attribution, before its licence detail),
 * with the chapter the cited work sits in when the excerpt numbering shows it.
 * The full attribution is carried through so the interface can still meet the
 * licence; this only chooses what leads.
 */
export function referenceSources(
  references: readonly string[],
): readonly ReferenceSource[] {
  return sourcesOfCitedExcerpts(citedExcerpts(references));
}

/** One cited excerpt: what it is called, and the source it is attributed to. */
export interface CitedExcerpt {
  readonly title: string;
  readonly attribution: string;
}

/**
 * The sources behind a lesson's excerpts, one entry per source.
 *
 * A prepared lesson keeps its excerpts as title and attribution already apart,
 * so this takes them that way. `referenceSources` is the same thing for a
 * lesson that only kept the joined line.
 */
export function sourcesOfCitedExcerpts(
  excerpts: readonly CitedExcerpt[],
): readonly ReferenceSource[] {
  return groupCitedExcerpts(excerpts).map((group) => ({
    textbook: group.attribution
      ? (group.attribution.split(",")[0] ?? group.attribution).trim()
      : group.titles.join(", "),
    chapter: chapterLabel(group.titles),
    attribution: group.attribution,
  }));
}

/** What separates an excerpt's title from the source it is attributed to. */
const REFERENCE_SEPARATOR = " — ";

/** Splits the joined line a flat lesson stores back into its two parts. */
function citedExcerpts(references: readonly string[]): readonly CitedExcerpt[] {
  return references.map((reference) => {
    const boundary = reference.indexOf(REFERENCE_SEPARATOR);
    return {
      title: (boundary === -1 ? reference : reference.slice(0, boundary)).trim(),
      attribution:
        boundary === -1 ? "" : reference.slice(boundary + REFERENCE_SEPARATOR.length).trim(),
    };
  });
}

function groupCitedExcerpts(excerpts: readonly CitedExcerpt[]): readonly ReferenceGroup[] {
  const titlesByAttribution = new Map<string, string[]>();
  for (const { title, attribution } of excerpts) {
    const titles = titlesByAttribution.get(attribution) ?? [];
    if (!titles.includes(title)) titles.push(title);
    titlesByAttribution.set(attribution, titles);
  }
  return [...titlesByAttribution].map(([attribution, titles]) => ({ attribution, titles }));
}

/** Joining words a title leaves lower unless they open or close it. */
const TITLE_MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor",
  "of", "on", "onto", "or", "over", "per", "the", "to", "up", "via", "vs", "with",
]);

const capitalise = (word: string): string =>
  word
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("-");

/**
 * How an official curriculum title reads in the interface.
 *
 * The bundled NERDC titles are stored in the shouting all-caps of the source
 * document ("WHOLE NUMBERS COUNTING AND WRITING"). A teacher product reads them
 * back in calm title case — each word capitalised, the small joining words left
 * lower, the first and last always raised. The source record is never changed;
 * this is only how it is shown.
 */
export function formatCurriculumTitle(title: string): string {
  const cleaned = title.trim();
  if (!cleaned) return cleaned;
  const words = cleaned.toLowerCase().split(/\s+/);
  const lastIndex = words.length - 1;
  return words
    .map((word, index) => {
      const bare = word.replace(/[^\p{L}]/gu, "");
      if (index !== 0 && index !== lastIndex && TITLE_MINOR_WORDS.has(bare)) {
        return word;
      }
      return capitalise(word);
    })
    .join(" ");
}

/**
 * What tells one weekly plan from another.
 *
 * A topic runs across several weeks, so leading with it makes those weeks read
 * as the same plan repeated. The subtopic is the part that differs, so it
 * leads, and the topic becomes the context it sits inside.
 */
export function schemeEntryLabel(
  entry: Pick<LessonSchemeEntryOption, "topic" | "subtopic" | "weekOrdinal">,
): SchemeEntryLabel {
  const week = `Week ${entry.weekOrdinal}`;
  if (!entry.subtopic) return { headline: entry.topic, context: week };
  return { headline: entry.subtopic, context: `${entry.topic} · ${week}` };
}

/** What the row is drawn among, so it says what nothing else has. */
export interface LessonRowSurroundings {
  /** The lessons drawn beside this one, which is where a twin would be. */
  readonly among: readonly LessonRowFacts[];
  /** Where the teacher is in the term, so the row can say "This week". */
  readonly currentWeek: CurrentTeachingWeek | null;
}

/**
 * What tells one lesson from every other, said on the row itself.
 *
 * The leading line is what the lesson covers. The second carries the rest, in
 * the order a teacher would say it: the topic it sits under, when it is taught,
 * and — only when a lesson beside it covers the very same ground — the hour it
 * was started.
 *
 * Everything a row needs is on the row, because nothing stands over it. The
 * list carried headings twice: four bands for when a lesson fell, and a topic
 * heading inside each. A teacher passed two of them to reach a lesson, read the
 * same topic in two places, and — because a topic holding one lesson was drawn
 * without a heading — could not tell where one group ended and the next began.
 */
export function lessonListLabel(
  lesson: LessonRowFacts,
  { among, currentWeek }: LessonRowSurroundings,
): SchemeEntryLabel {
  const when = whenItIsTaught(lesson, currentWeek);
  const headline = whatItCovers(lesson, when);
  const context = [
    headline === lesson.topic ? null : lesson.topic,
    headline === when ? null : when,
    coversTheSameGround(lesson, among) ? startedOn(lesson.startedAt) : null,
  ].filter(Boolean);
  return context.length > 0 ? { headline, context: context.join(" · ") } : { headline };
}

/**
 * The line a teacher reads to know which lesson this row is.
 *
 * A week the scheme sets is offered as one plan covering all of it, so the week
 * is what that row is. A subtopic leads with itself, and a lesson that is the
 * whole of its topic leads with the topic.
 */
function whatItCovers(lesson: LessonRowFacts, when: string): string {
  if ((lesson.schemeWeekId ?? null) !== null) return when;
  return lesson.subtopic ?? lesson.topic;
}

/**
 * When a teacher takes this lesson, in the words they would use for it.
 *
 * A lesson with no week is not late and not lost — nothing has been decided
 * about it yet, which is what the row says. "Not scheduled yet" was the
 * engine's phrase for it, printed as a heading over a group.
 */
function whenItIsTaught(
  lesson: LessonRowFacts,
  currentWeek: CurrentTeachingWeek | null,
): string {
  if (lesson.weekOrdinal === null) return "No week yet";
  const running = currentWeek?.standing === "thisWeek";
  return running && lesson.weekOrdinal === currentWeek.ordinal
    ? "This week"
    : `Week ${lesson.weekOrdinal}`;
}

/**
 * Whether a lesson beside this one plans the very same thing.
 *
 * Three drafts of Millions with no week between them read identically, so a
 * teacher choosing one was choosing blind — and the hour each was started is
 * then the only thing left to tell them apart.
 *
 * The same ground is the same topic, the same subtopic and the same week. Rows
 * differing in any of the three already read differently: two names shared
 * across topics are separated by the topic, and two weeks of one topic by the
 * week each leads with.
 */
function coversTheSameGround(
  lesson: LessonRowFacts,
  among: readonly LessonRowFacts[],
): boolean {
  return among.some(
    (other) =>
      other !== lesson &&
      other.topic === lesson.topic &&
      (other.subtopic ?? null) === (lesson.subtopic ?? null) &&
      other.weekOrdinal === lesson.weekOrdinal,
  );
}

export interface LessonRowFacts {
  readonly topic: string;
  readonly subtopic: string | null;
  readonly weekOrdinal: number | null;
  /** Set when the row is a whole week the scheme sets, offered as one plan. */
  readonly schemeWeekId?: string | null;
  readonly startedAt?: string;
}

/**
 * The day a lesson was started, in a teacher's words.
 *
 * Two drafts begun on the same day need the hour between them, which is why the
 * time is here and not only the date.
 */
function startedOn(startedAt: string | undefined): string | undefined {
  if (!startedAt) return undefined;
  const started = new Date(`${startedAt.replace(" ", "T")}Z`);
  if (Number.isNaN(started.getTime())) return undefined;
  return `Started ${new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(started)}`;
}

export type LessonSummary = LessonWorkspaceSnapshot["lessons"][number];

/**
 * A lesson as the workspace lists it — planned or not yet.
 *
 * The teacher's scheme is what commits them to teach; each of its entries is a
 * lesson, whether or not a plan has been written. A lesson that is not on the
 * scheme still shows, so nothing a teacher has written can go missing while the
 * two are being reconciled.
 */
export interface WorkspaceLesson {
  readonly key: string;
  readonly lessonId: string | null;
  readonly schemeWeekId: string | null;
  readonly schemeEntryId: string | null;
  readonly topic: string;
  readonly subtopic: string | null;
  readonly weekOrdinal: number | null;
  readonly status: LessonSummary["status"] | "unplanned";
  /**
   * When the teacher started this lesson, absent for a scheme entry nobody has.
   *
   * It is what tells two drafts of the same subtopic apart when neither has a
   * week; a weekly plan with no lesson against it has nothing to tell apart.
   */
  readonly startedAt?: string;
}

/**
 * The week's lessons: what the scheme commits the teacher to, married to what
 * they have actually written.
 *
 * An entry with a lesson reads as that lesson. An entry without one is still a
 * lesson — it simply has no plan yet. Lessons sitting outside the scheme are
 * kept and listed too rather than hidden, and the scheme's own order is what
 * the list follows.
 */
/**
 * What the scheme still commits a teacher to, offered the way they will write it.
 *
 * A week nobody has written for is one row, because one lesson plan is what a
 * teacher writes for a week — its subtopics are what that plan covers, not
 * three plans and three signatures.
 *
 * Once one subtopic of a week has a plan of its own, the week can no longer be
 * planned whole: a second plan would cover ground the first already does, which
 * the schema refuses. So the subtopics still waiting are offered one by one,
 * which is the only way left to write them.
 */
function weeksAwaitingAPlan(
  entries: readonly LessonSchemeEntryOption[],
  alreadyPlanned: ReadonlySet<string>,
): WorkspaceLesson[] {
  const weeks = new Map<string, LessonSchemeEntryOption[]>();
  for (const entry of entries) {
    weeks.set(entry.weekId, [...(weeks.get(entry.weekId) ?? []), entry]);
  }
  return [...weeks.values()].flatMap((held): WorkspaceLesson[] => {
    if (held.some((entry) => alreadyPlanned.has(entry.entryId))) {
      return held
        .filter((entry) => !alreadyPlanned.has(entry.entryId))
        .map((entry) => ({
          key: entry.entryId,
          lessonId: null,
          schemeWeekId: null,
          schemeEntryId: entry.entryId,
          topic: entry.topic,
          subtopic: entry.subtopic,
          weekOrdinal: entry.weekOrdinal,
          status: "unplanned" as const,
        }));
    }
    const first = held[0]!;
    const topics = [...new Set(held.map((entry) => entry.topic))];
    return [
      {
        key: first.weekId,
        lessonId: null,
        schemeWeekId: first.weekId,
        schemeEntryId: null,
        topic: topics.length === 1 ? first.topic : topics.join(" · "),
        subtopic: null,
        weekOrdinal: first.weekOrdinal,
        status: "unplanned" as const,
      },
    ];
  });
}

export function workspaceLessons(
  lessons: readonly LessonSummary[],
  entries: readonly LessonSchemeEntryOption[],
): readonly WorkspaceLesson[] {
  const alreadyPlanned = new Set(
    lessons
      .map((lesson) => lesson.schemeEntryId)
      .filter((entryId): entryId is string => entryId !== null),
  );
  const written: WorkspaceLesson[] = lessons.map((lesson) => ({
    key: lesson.id,
    lessonId: lesson.id,
    schemeWeekId: null,
    schemeEntryId: lesson.schemeEntryId,
    topic: lesson.topic,
    subtopic: lesson.subtopic,
    weekOrdinal: lesson.weekOrdinal,
    status: lesson.status,
    startedAt: lesson.startedAt,
  }));
  const awaiting = weeksAwaitingAPlan(entries, alreadyPlanned);
  // A row sits where the scheme puts it: a subtopic at its entry, a week at the
  // first of its entries. A lesson the scheme does not know sits after them.
  const byEntry = new Map(entries.map((entry, index) => [entry.entryId, index]));
  const byWeek = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (!byWeek.has(entry.weekId)) byWeek.set(entry.weekId, index);
  });
  const placing = ({ schemeEntryId, schemeWeekId }: WorkspaceLesson) => {
    if (schemeEntryId !== null) return byEntry.get(schemeEntryId) ?? Number.MAX_SAFE_INTEGER;
    if (schemeWeekId !== null) return byWeek.get(schemeWeekId) ?? Number.MAX_SAFE_INTEGER;
    return Number.MAX_SAFE_INTEGER;
  };
  return [...written, ...awaiting].sort((a, b) => placing(a) - placing(b));
}

/** Where the teacher is in the scheme, as the list and heading read it. */
export interface CurrentTeachingWeek {
  readonly ordinal: number;
  readonly title?: string | null;
  /** Where today stands against this week: in it, before it, or after it. */
  readonly standing?: "thisWeek" | "notStarted" | "finished";
}

/**
 * What the lessons screen leads with: this week, and where its lessons stand.
 *
 * Only what is true is said. A week whose lessons are all still to be written
 * says nothing about being ready, rather than claiming a readiness it would
 * have to take back.
 */
export function lessonsHeadline(
  lessons: readonly {
    readonly weekOrdinal: number | null;
    readonly status: LessonStatus;
    readonly classworkComplete: boolean;
  }[],
  currentWeek: CurrentTeachingWeek | null,
): { readonly title: string; readonly subtitle: string } {
  const readiness = (
    scoped: readonly { readonly status: LessonStatus; readonly classworkComplete: boolean }[],
  ): string => {
    const lessonWord = scoped.length === 1 ? "lesson" : "lessons";
    const ready = scoped.filter(readyToTeach).length;
    const awaitingClasswork = scoped.filter(
      (lesson) => lesson.status === "confirmed" && !lesson.classworkComplete,
    ).length;
    const counts = [`${scoped.length} ${lessonWord}`];
    if (ready > 0) counts.push(`${ready} ready to teach`);
    if (awaitingClasswork > 0)
      counts.push(`${awaitingClasswork} still ${awaitingClasswork === 1 ? "needs" : "need"} classwork`);
    return counts.join(" · ");
  };
  if (!currentWeek) {
    return { title: "Your lessons", subtitle: readiness(lessons) };
  }
  const thisWeek = lessons.filter((lesson) => lesson.weekOrdinal === currentWeek.ordinal);
  if (thisWeek.length === 0) {
    return { title: "This week", subtitle: "No lessons this week yet" };
  }
  return { title: "This week", subtitle: readiness(thisWeek) };
}

/**
 * Whether a teacher could walk into the room with this lesson.
 *
 * The plan a head of department signs and the worked examples and practice the
 * class writes — both, because a teacher arrives with both. Counting a
 * confirmed plan alone told a teacher three lessons were ready to teach while
 * all three had unwritten classwork, which is the one claim the product cannot
 * afford to get wrong.
 */
export function readyToTeach(lesson: {
  readonly status: LessonStatus;
  readonly classworkComplete: boolean;
}): boolean {
  return lesson.status === "confirmed" && lesson.classworkComplete;
}

export type LessonInputMode = z.infer<typeof lessonInputModeSchema>;

export interface LessonContextRequest {
  readonly academicSessionId: string;
  readonly academicPeriodId: string;
  readonly teachingAssignmentId: string;
}

export interface LessonWorkspaceRequest {
  readonly context: LessonContextRequest;
  readonly selectedLessonId: string | null;
}

export interface LessonStepInput {
  readonly title: string;
  readonly teacherActivity: string;
  readonly learnerActivity: string;
  readonly durationMinutes: number | null;
}

export interface SaveLessonDraftRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string | null;
  readonly schemeWeekId: string | null;
  readonly schemeEntryId: string | null;
  readonly inputMode: LessonInputMode;
  readonly topic: string;
  readonly subtopic: string | null;
  readonly rawPlan: string | null;
  readonly learningGoals: string[];
  readonly steps: LessonStepInput[];
  readonly instructionalMaterials: string[];
  readonly previousKnowledge: string[];
  readonly assessment: string[];
  readonly assignment: string[];
  readonly references: string[];
}


export interface GranularLessonProgramInputRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly lessonDurationMinutes: number;
}

export interface SaveGranularLessonRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly record: GranularLessonRecord;
}

export interface SaveAuthoredLessonRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string | null;
  readonly schemeWeekId: string | null;
  readonly schemeEntryId: string | null;
  readonly topic: string;
  readonly subtopic: string | null;
  readonly content: LessonContent;
}

export interface ConfirmGranularLessonRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
}

export interface SaveStudentNoteRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly note: StudentNote;
}

export type { GranularLessonRecord, GranularLessonProgramInput };
export type { StudentNote };

export interface DiscardLessonRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
}

export interface MoveLessonDraftRequest {
  readonly lessonId: string;
  readonly sourceContext: LessonContextRequest;
  readonly targetContext: LessonContextRequest;
  readonly schemeWeekId: string | null;
  readonly schemeEntryId: string | null;
}

export interface LessonLaunch {
  readonly schemeWeekId: string;
  readonly schemeEntryId: string;
}

export function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
