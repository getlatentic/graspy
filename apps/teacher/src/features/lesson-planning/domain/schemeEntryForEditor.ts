import type { LessonDraft, LessonLaunch, LessonSchemeEntryOption } from "./lessonPlanning";

/** A lesson being written, as this question needs to read it. */
export type EditorSubject =
  | { readonly kind: "new"; readonly launch: LessonLaunch | null }
  | { readonly kind: "edit"; readonly lesson: LessonDraft };

/**
 * The weekly plan an editor belongs to, and whether it has gone.
 *
 * Four values were derived for this inline — the plan a new lesson was launched
 * from, the plan an edited lesson sits on, whichever of those applies, and
 * whether the one asked for is missing — each repeating the same lookup with
 * the fields spelled out again. Missing is the one that matters: it is what
 * puts an error on screen in place of the editor, and it was the hardest of the
 * four to read.
 */
export function schemeEntryForEditor(
  editor: EditorSubject | null,
  entries: readonly LessonSchemeEntryOption[],
): { readonly entry: LessonSchemeEntryOption | null; readonly missing: boolean } {
  const asked = plannedWeek(editor);
  if (!asked) return { entry: null, missing: false };
  const entry =
    entries.find(({ weekId, entryId }) => weekId === asked.weekId && entryId === asked.entryId) ??
    null;
  return { entry, missing: entry === null };
}

/** Which week and entry the editor names, when it names one at all. */
function plannedWeek(
  editor: EditorSubject | null,
): { readonly weekId: string; readonly entryId: string } | null {
  if (!editor) return null;
  if (editor.kind === "new") {
    return editor.launch
      ? { weekId: editor.launch.schemeWeekId, entryId: editor.launch.schemeEntryId }
      : null;
  }
  const { schemeWeekId, schemeEntryId } = editor.lesson;
  return schemeWeekId && schemeEntryId ? { weekId: schemeWeekId, entryId: schemeEntryId } : null;
}
