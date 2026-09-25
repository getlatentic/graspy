import type { LessonToDraft } from "../domain/lessonDrafting";
import type {
  LessonWorkspaceSnapshot,
  SaveAuthoredLessonRequest,
  SaveLessonDraftRequest,
} from "../domain/lessonPlanning";

/**
 * What a save came to, said as a fact rather than as an instruction.
 *
 * `lessonId` is the lesson the save settled on: the one written, or the one
 * just created. It is `null` only when the save was refused, or when a
 * hand-written lesson was updated in place and no id was needed to find it.
 */
export type AuthoringOutcome =
  | { readonly kind: "refused" }
  | {
      readonly kind: "saved";
      readonly lessonId: string | null;
      /** True when the save created a lesson that did not exist before. */
      readonly isNew: boolean;
    };

/** What these flows need of the lesson store, and nothing about a screen. */
export interface AuthoringStore {
  /** What the workspace held before the save, to tell a new lesson from the rest. */
  readonly snapshot: LessonWorkspaceSnapshot;
  readonly saveDraft: (
    request: Omit<SaveLessonDraftRequest, "context">,
  ) => Promise<LessonWorkspaceSnapshot | null>;
  readonly saveAuthoredLesson: (
    request: Omit<SaveAuthoredLessonRequest, "context">,
  ) => Promise<boolean>;
}

/**
 * What a teacher's writing actions set in motion.
 *
 * Each flow saves and reports what the save came to. What the screen does next
 * — where it looks, what it closes, whether a run starts — is the caller's to
 * decide, because only the caller knows there is a screen. A flow that took
 * `openLesson` and `closeEditor` could only be run by something with those.
 *
 * Saving is the awkward part and it is awkward for a real reason: a new lesson
 * has no identity until it is saved, so anything that must happen to it
 * afterwards has to find the lesson the workspace did not hold before.
 */
export function lessonAuthoring({
  snapshot,
  saveDraft,
  saveAuthoredLesson,
}: AuthoringStore) {
  /** The lesson a save added, found by what the workspace did not hold before. */
  const lessonAddedBy = (saved: LessonWorkspaceSnapshot): string | null => {
    const known = new Set(snapshot.lessons.map(({ id }) => id));
    return saved.lessons.find(({ id }) => !known.has(id))?.id ?? null;
  };

  return {
    /**
     * "Draft with graspy" needs a lesson to prepare. A weekly plan's entry is
     * written into one first, seeded from the scheme; a bare draft already
     * exists and is reported straight back.
     */
    draftWithGraspy: async (target: LessonToDraft): Promise<AuthoringOutcome> => {
      if (target.lessonId) {
        return { kind: "saved", lessonId: target.lessonId, isNew: false };
      }
      const saved = await saveDraft({
        lessonId: null,
        schemeWeekId: target.schemeWeekId,
        schemeEntryId: target.schemeEntryId,
        inputMode: "structured",
        topic: target.topic,
        subtopic: target.subtopic,
        rawPlan: null,
        learningGoals: target.learningGoals,
        steps: [],
        instructionalMaterials: target.instructionalMaterials,
        previousKnowledge: [],
        assessment: target.assessment,
        assignment: [],
        references: [],
      });
      if (!saved) return { kind: "refused" };
      const lessonId = lessonAddedBy(saved);
      return lessonId ? { kind: "saved", lessonId, isNew: true } : { kind: "refused" };
    },

    /** A lesson written by hand, new or edited in place. */
    saveAuthored: async (
      request: Omit<SaveAuthoredLessonRequest, "context">,
    ): Promise<AuthoringOutcome> => {
      const saved = await saveAuthoredLesson(request);
      if (!saved) return { kind: "refused" };
      return { kind: "saved", lessonId: request.lessonId, isNew: request.lessonId === null };
    },

    /** A plan saved from the editor. */
    savePlan: async (
      request: Omit<SaveLessonDraftRequest, "context">,
    ): Promise<AuthoringOutcome> => {
      const saved = await saveDraft(request);
      if (!saved) return { kind: "refused" };
      const lessonId = request.lessonId ?? lessonAddedBy(saved);
      return { kind: "saved", lessonId, isNew: request.lessonId === null };
    },
  };
}
