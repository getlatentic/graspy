import type { LessonLanguage } from "./voice-types";

/** Classes the voice curriculum teaches, as the server keys them. */
const CLASSES_WITH_LESSONS = new Set([
  "nursery_1",
  "nursery_2",
  "kindergarten",
  "primary_1",
  "primary_2",
  "primary_3",
  "primary_4",
  "primary_5",
  "primary_6",
]);

// The catalogue's Nigerian levels are "primary-4", "jss-1"; the server's classes "primary_4".
const NIGERIAN_LEVEL = /^(primary|jss)-([1-6])$/;

/** The voice class of a learner in Nigeria's catalogue system; null when there are no voice lessons. */
export function voiceClassOf(details: {
  system?: string;
  level?: string;
}): string | null {
  if (details.system !== "NG") return null;
  const match = NIGERIAN_LEVEL.exec(details.level ?? "");
  const found = match && `${match[1]}_${match[2]}`;
  return found && CLASSES_WITH_LESSONS.has(found) ? found : null;
}

const SPOKEN = new Set<string>(["en", "yo", "pcm"]);

/** The teacher speaks the learner's language when she can, and English otherwise. */
export const lessonLanguageOf = (language: string): LessonLanguage =>
  (SPOKEN.has(language) ? language : "en") as LessonLanguage;

/** The recording set a lesson's answers belong to. */
export const languagePairOf = (language: LessonLanguage) =>
  language === "yo" ? ("yo-en" as const) : ("pcm-en" as const);
