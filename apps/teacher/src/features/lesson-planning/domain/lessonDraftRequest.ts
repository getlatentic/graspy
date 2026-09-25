import { lines, type LessonInputMode, type SaveLessonDraftRequest } from "./lessonPlanning";

/** What the teacher has typed into the editor, as text, before it is read apart. */
export interface EditedDraft {
  readonly topic: string;
  readonly subtopic: string;
  readonly rawPlan: string;
  readonly learningGoals: string;
  readonly instructionalMaterials: string;
  readonly previousKnowledge: string;
  readonly assessment: string;
  readonly assignment: string;
  readonly references: string;
}

/** Where the lesson is being written, and what it is being written against. */
export interface DraftTarget {
  readonly lessonId: string | null;
  readonly schemeWeekId: string | null;
  readonly schemeEntryId: string | null;
  readonly inputMode: LessonInputMode;
}

/**
 * What a save from the editor asks for.
 *
 * The two input modes save different halves of the same form, and which half
 * is the whole difference between them: a pasted plan keeps the teacher's own
 * words and nothing structured, because nothing has read them apart yet; a
 * structured lesson keeps the fields and no raw text, because there is none.
 * Saving both would leave two accounts of one lesson with nothing to say which
 * the teacher meant.
 *
 * A subtopic of only spaces is no subtopic.
 */
export function draftRequestOf(
  target: DraftTarget,
  edited: EditedDraft,
  steps: SaveLessonDraftRequest["steps"],
): Omit<SaveLessonDraftRequest, "context"> {
  const structured = target.inputMode === "structured";
  return {
    lessonId: target.lessonId,
    schemeWeekId: target.schemeWeekId,
    schemeEntryId: target.schemeEntryId,
    inputMode: target.inputMode,
    topic: edited.topic,
    subtopic: edited.subtopic.trim() || null,
    rawPlan: structured ? null : edited.rawPlan,
    learningGoals: structured ? lines(edited.learningGoals) : [],
    steps: structured ? steps : [],
    instructionalMaterials: structured ? lines(edited.instructionalMaterials) : [],
    previousKnowledge: structured ? lines(edited.previousKnowledge) : [],
    assessment: structured ? lines(edited.assessment) : [],
    assignment: structured ? lines(edited.assignment) : [],
    references: structured ? lines(edited.references) : [],
  };
}
