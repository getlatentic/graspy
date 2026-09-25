import type { SchemeTemplateSummary } from "./schemeOfWork";

/**
 * Which template the teacher is looking at.
 *
 * The choice they made, and the first one until they make one — so the preview
 * beside the list is never blank on arrival. A choice that is no longer in the
 * list falls back the same way, which is what happens when the library reloads
 * and the template they had picked is gone.
 */
export function chosenTemplate(
  templates: readonly SchemeTemplateSummary[],
  chosenId: string | null,
): SchemeTemplateSummary | null {
  return templates.find(({ id }) => id === chosenId) ?? templates[0] ?? null;
}

/** What a week in a template is for, as a teacher would name it on a timetable. */
export function weekKindName(kind: SchemeTemplateSummary["weeks"][number]["kind"]): string {
  if (kind === "revision") return "Revision";
  if (kind === "test") return "Test";
  if (kind === "examination") return "Examinations";
  if (kind === "break") return "Break";
  return "Teaching";
}
