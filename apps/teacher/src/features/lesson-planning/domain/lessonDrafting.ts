import type { LessonDraft, LessonSchemeEntryOption, WorkspaceLesson } from "./lessonPlanning";

/**
 * A lesson graspy is about to draft, gathered from wherever it starts.
 *
 * Two places start one: a weekly plan's entry that has no lesson yet, and a
 * lesson that exists but has no plan written into it. Both built this object
 * inline, eight fields each, so the two starting points read as two different
 * jobs instead of one job with two beginnings.
 */
export interface LessonToDraft {
  readonly lessonId: string | null;
  readonly schemeWeekId: string | null;
  readonly schemeEntryId: string | null;
  readonly topic: string;
  readonly subtopic: string | null;
  readonly learningGoals: string[];
  readonly instructionalMaterials: string[];
  readonly assessment: string[];
}

/** Starting from a weekly plan's entry: the lesson does not exist yet. */
export function draftFromSchemeEntry(
  opened: WorkspaceLesson,
  entry: LessonSchemeEntryOption,
): LessonToDraft {
  return {
    lessonId: null,
    schemeWeekId: opened.schemeWeekId,
    schemeEntryId: opened.schemeEntryId,
    topic: opened.topic,
    subtopic: opened.subtopic,
    learningGoals: entry.learningGoals,
    instructionalMaterials: entry.instructionalMaterials,
    assessment: entry.assessment,
  };
}

/** Starting from a lesson that exists and carries its own goals. */
export function draftFromLesson(lesson: LessonDraft): LessonToDraft {
  return {
    lessonId: lesson.id,
    schemeWeekId: lesson.schemeWeekId,
    schemeEntryId: lesson.schemeEntryId,
    topic: lesson.topic,
    subtopic: lesson.subtopic,
    learningGoals: lesson.learningGoals,
    instructionalMaterials: lesson.instructionalMaterials,
    assessment: lesson.assessment,
  };
}

/**
 * What the scheme commits a teacher to for the thing they are about to plan.
 *
 * A plan covering one subtopic is written against that entry. A plan covering
 * the week is written against every entry in it — its goals, the aids it asks
 * for and the checks it sets, gathered once and in the scheme's own order,
 * because one plan for the week is what the teacher will hand in for it.
 */
export function schemeGroundToPlan(
  planning: { readonly schemeEntryId: string | null; readonly schemeWeekId: string | null },
  entries: readonly LessonSchemeEntryOption[],
): LessonSchemeEntryOption | undefined {
  if (planning.schemeEntryId !== null) {
    return entries.find((entry) => entry.entryId === planning.schemeEntryId);
  }
  if (planning.schemeWeekId === null) return undefined;
  const held = entries.filter((entry) => entry.weekId === planning.schemeWeekId);
  const first = held[0];
  if (!first) return undefined;
  const gathered = <T>(pick: (entry: LessonSchemeEntryOption) => readonly T[]) => [
    ...new Set(held.flatMap(pick)),
  ];
  return {
    ...first,
    subtopic: null,
    learningGoals: gathered((entry) => entry.learningGoals),
    instructionalMaterials: gathered((entry) => entry.instructionalMaterials),
    assessment: gathered((entry) => entry.assessment),
    curriculumOutcomes: [
      ...new Map(
        held.flatMap((entry) => entry.curriculumOutcomes).map((outcome) => [outcome.id, outcome]),
      ).values(),
    ],
  };
}
