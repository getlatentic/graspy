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

// Slide lessons are text, and children in these classes do not read yet.
const EARLY_YEARS = new Set(["nursery-1", "nursery-2", "kindergarten"]);

interface ClassDetails {
  system?: string;
  level?: string;
}

/** Nigeria's nursery and kindergarten classes: voice lessons, and no slide subjects. */
export const voiceOnly = (details: ClassDetails): boolean =>
  details.system === "NG" && EARLY_YEARS.has(details.level ?? "");

/** The plan's class, and the profile's for a plan made before plans carried it. */
export const classOf = (
  plan: ClassDetails | null | undefined,
  profile: ClassDetails | null,
): ClassDetails | null => (plan?.level ? plan : profile);

/** The voice class of a learner in Nigeria's catalogue system; null when there are no voice lessons.
 * The catalogue names a class "nursery-1" or "primary-4", the server "nursery_1" or "primary_4". */
export function voiceClassOf(details: ClassDetails): string | null {
  if (details.system !== "NG") return null;
  const found = (details.level ?? "").replaceAll("-", "_");
  return CLASSES_WITH_LESSONS.has(found) ? found : null;
}

const SPOKEN = new Set<string>(["en", "yo", "pcm"]);

/** The teacher speaks the learner's language when she can, and English otherwise. */
export const lessonLanguageOf = (language: string): LessonLanguage =>
  (SPOKEN.has(language) ? language : "en") as LessonLanguage;

/** The recording set a lesson's answers belong to. */
export const languagePairOf = (language: LessonLanguage) =>
  language === "yo" ? ("yo-en" as const) : ("pcm-en" as const);
