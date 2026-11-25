import type { TutorAction } from "@/lib/a2a/reply-data";
import { schoolSystems, type SchoolLevel } from "@/lib/education-api";
import {
  afterSchoolDescriptor,
  AFTER_SCHOOL,
  schoolDescriptor,
} from "@/lib/learner-level";
import { countryCodeNamed } from "@/lib/plan-details";
import type { LearnerDetails } from "@/lib/user-storage";

type SetDetails = Extract<TutorAction, { type: "set_details" }>;

/** What the learner said, as the details the app keeps, and whether their class learns by
 * voice alone. */
export interface SaidDetails {
  details: LearnerDetails;
  voiceOnly: boolean;
}

const NO_CLASS = {
  system: "",
  level: "",
  levelNames: null,
  course: "",
  gradeLevel: "",
} as const;

const plain = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function isNamed(level: SchoolLevel, said: string): boolean {
  const names = [
    level.id,
    level.name.en,
    ...Object.values(level.name.local ?? {}),
    ...level.aliases,
  ];
  return names.some((name) => plain(name) === said);
}

/** The details a learner's words make, or null when they name a country or class the
 * catalogue does not hold. A class is the country's main system's, as onboarding offers it. */
export async function detailsSaid(
  said: SetDetails,
  kept: LearnerDetails | null,
  systemsOf: typeof schoolSystems = schoolSystems,
): Promise<SaidDetails | null> {
  const country = said.country ? countryCodeNamed(said.country) : kept?.country;
  if (!country) return null;
  const language = kept?.language || "en";
  const place = { country, language };

  const wanted = plain(said.className);
  const after = AFTER_SCHOOL.find((level) => level === wanted);
  if (after) {
    const course = said.course.trim();
    if (!course) return null;
    const gradeLevel = afterSchoolDescriptor(after, course);
    return {
      details: { ...place, ...NO_CLASS, level: after, course, gradeLevel },
      voiceOnly: false,
    };
  }
  if (!wanted) {
    // A class belongs to its country's system, so another country starts it again.
    const details =
      kept && kept.country === country ? kept : { ...place, ...NO_CLASS };
    return { details, voiceOnly: false };
  }

  const [system] = await systemsOf(country);
  const level = system?.levels.find((candidate) => isNamed(candidate, wanted));
  if (!system || !level) return null;
  return {
    details: {
      ...place,
      system: system.id,
      level: level.id,
      levelNames: level.name,
      course: "",
      gradeLevel: schoolDescriptor(system, level),
    },
    voiceOnly: level.voiceOnly ?? false,
  };
}
