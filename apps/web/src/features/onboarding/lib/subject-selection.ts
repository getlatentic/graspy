import { SUBJECT_SELECTION_LIMIT } from "../constants";
import type { GeneratedSubject } from "../types";
import { subjectsMatching } from "./starting-subjects";

/** Unchanged when choosing one more would pass the limit. */
export function toggledSelection(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (selected.length >= SUBJECT_SELECTION_LIMIT) return selected;
  return [...selected, id];
}

export function seededSelection(
  available: readonly GeneratedSubject[],
  picked: string | undefined,
): string[] {
  const recommended = available.filter((s) => s.recommended).map((s) => s.id);
  return [...new Set([...recommended, ...subjectsMatching(picked, available)])];
}
