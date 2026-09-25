import {
  nameIn,
  type Names,
  type SchoolLevel,
  type SchoolSystem,
} from "./education-api";
import type { Translate } from "./i18n-context";

export const AFTER_SCHOOL = ["undergraduate", "graduate"] as const;
type AfterSchool = (typeof AFTER_SCHOOL)[number];

/** Onboarding does not offer it; profiles an earlier version saved keep it. */
export const ON_MY_OWN = "on-my-own";

// The server reads a level of at most 100 characters; the longest
// after-school prefix leaves this much for the course.
export const COURSE_MAX = 68;
const LEVEL_MAX = 100;

export interface LearnerLevel {
  system: string;
  level: string;
  /** Kept to name the class offline in the learner's language. */
  levelNames: Names | null;
  course: string;
}

export const isAfterSchool = (level: string): level is AfterSchool =>
  (AFTER_SCHOOL as readonly string[]).includes(level);

export function levelComplete(level: LearnerLevel): boolean {
  if (isAfterSchool(level.level)) return level.course.trim().length > 0;
  return Boolean(level.system && level.level && level.levelNames);
}

/** "JSS 1 (Junior Secondary School), Nigeria, age 12", as the server reads it. */
export function schoolDescriptor(
  system: SchoolSystem,
  level: SchoolLevel,
): string {
  const stage = system.stages.find((s) => s.id === level.stage)?.name.en;
  const where = `${system.name.en}, age ${level.age}`;
  const full = stage
    ? `${level.name.en} (${stage}), ${where}`
    : `${level.name.en}, ${where}`;
  return full.length <= LEVEL_MAX
    ? full
    : `${level.name.en}, ${where}`.slice(0, LEVEL_MAX);
}

/** The course chooses the subjects (measured: Accounting gets Auditing, Taxation). */
export function afterSchoolDescriptor(
  level: AfterSchool,
  course: string,
): string {
  const who =
    level === "graduate" ? "Graduate student" : "Undergraduate student";
  return `${who}, studying ${course.trim()}`;
}

export function levelLabel(
  learner: LearnerLevel & { language: string; gradeLevel: string },
  t: Translate,
): string {
  if (isAfterSchool(learner.level)) {
    return t(`level.${learner.level}`);
  }
  if (learner.level === ON_MY_OWN) return t("you.onMyOwn");
  if (learner.levelNames) return nameIn(learner.levelNames, learner.language);
  return learner.gradeLevel;
}
