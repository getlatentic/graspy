import { z } from "zod";

/**
 * The note pupils copy and read, written from a lesson's finished plan.
 *
 * It is short prose, not a worksheet: a handful of plain paragraphs a class can
 * read and keep. It is kept with the lesson version it was written from, so a
 * note left behind by a later edit can be told apart from a current one.
 */
export const studentNoteSchema = z.object({
  paragraphs: z.array(z.string().trim().min(1)).min(1).max(12),
  writtenFromVersion: z.number().int().nonnegative(),
});

export type StudentNote = z.infer<typeof studentNoteSchema>;

/** A note is stale once the lesson has been edited past the version it was written from. */
export function noteMatchesLesson(note: StudentNote, latestVersionNumber: number): boolean {
  return note.writtenFromVersion === latestVersionNumber;
}
