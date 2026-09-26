import {
  afterSchoolDescriptor,
  isAfterSchool,
  levelComplete,
} from "@/lib/learner-level";
import type { LearnerDetails, UserProfile } from "@/lib/user-storage";
import type { DetailsSchema } from "../schemas/onboarding-schema";

export function learnerDetails(details: DetailsSchema): LearnerDetails {
  const { country, language, level } = details;
  if (isAfterSchool(level)) {
    const course = details.course.trim();
    return {
      country,
      language,
      system: "",
      level,
      levelNames: null,
      course,
      gradeLevel: afterSchoolDescriptor(level, course),
    };
  }
  return {
    country,
    language,
    system: details.system,
    level,
    levelNames: details.school?.names ?? null,
    course: "",
    gradeLevel: details.school?.descriptor ?? "",
  };
}

export const detailsComplete = (details: DetailsSchema): boolean =>
  Boolean(details.country && details.language) &&
  levelComplete(learnerDetails(details));

export function detailsOf(profile: UserProfile): DetailsSchema {
  return {
    country: profile.country,
    language: profile.language,
    system: profile.system,
    level:
      profile.levelNames || isAfterSchool(profile.level) ? profile.level : "",
    school: profile.levelNames
      ? { names: profile.levelNames, descriptor: profile.gradeLevel }
      : null,
    course: profile.course,
  };
}

/** Whether the class learns by voice alone, as the server says: the catalogue's word for a
 * class chosen from it, `now` for the class the learner already has; a level after school
 * never does. */
export function learnsByVoiceAlone(
  details: DetailsSchema,
  now: boolean,
): boolean {
  if (!details.school) return false;
  return details.school.voiceOnly ?? now;
}

/** What saving new details does to the plan. A class that learns by voice alone shows no
 * subjects, so its plan only takes the details, subjects and all. A plan with no subjects
 * has nothing to keep for another class; otherwise the learner chooses. */
export function detailsSave(
  details: DetailsSchema,
  planHasSubjects: boolean,
  voiceOnlyNow: boolean,
): "keep" | "new" | "ask" {
  if (learnsByVoiceAlone(details, voiceOnlyNow)) return "keep";
  return planHasSubjects ? "ask" : "new";
}

export function detailsChanged(
  profile: UserProfile,
  details: DetailsSchema,
): boolean {
  const next = learnerDetails(details);
  return (
    next.country !== profile.country ||
    next.language !== profile.language ||
    next.system !== profile.system ||
    next.level !== profile.level ||
    next.course !== profile.course
  );
}
