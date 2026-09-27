import { SUBJECTS_PATH, lessonPath, subjectPath } from "@/lib/learn-paths";

// Where a note from the app leads, as the learner's devices share it: the web keeps a path,
// the phone a screen, so neither's own form travels.
export type LinkTarget =
  | { type: "lesson"; subjectSlug: string; topicIndex: number }
  | { type: "subject"; subjectSlug: string }
  | { type: "subjects" };

const LESSON = /^\/app\/learn\/([^/]+)\/lesson\/(\d+)$/;
const SUBJECT = /^\/app\/learn\/([^/]+)$/;

function slugOf(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function targetOf(path: string): LinkTarget | null {
  if (path === SUBJECTS_PATH) return { type: "subjects" };
  const lesson = LESSON.exec(path);
  const lessonSlug = lesson && slugOf(lesson[1]);
  if (lesson && lessonSlug) {
    return {
      type: "lesson",
      subjectSlug: lessonSlug,
      topicIndex: Number(lesson[2]),
    };
  }
  const subject = SUBJECT.exec(path);
  const subjectSlug = subject && slugOf(subject[1]);
  return subjectSlug ? { type: "subject", subjectSlug } : null;
}

/** Null for a target this app does not know. */
export function pathOf(value: unknown): string | null {
  const target = value as Partial<{
    type: string;
    subjectSlug: unknown;
    topicIndex: unknown;
  }> | null;
  if (target?.type === "subjects") return SUBJECTS_PATH;
  if (typeof target?.subjectSlug !== "string" || !target.subjectSlug) {
    return null;
  }
  if (target.type === "subject") return subjectPath(target.subjectSlug);
  const index = target.topicIndex;
  return target.type === "lesson" &&
    Number.isInteger(index) &&
    Number(index) >= 0
    ? lessonPath(target.subjectSlug, Number(index))
    : null;
}
