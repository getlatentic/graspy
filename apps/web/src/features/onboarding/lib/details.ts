import {
  afterSchoolDescriptor,
  isAfterSchool,
  levelComplete,
} from "@/lib/learner-level";
import type { UserProfile } from "@/lib/user-storage";
import type { DetailsSchema } from "../schemas/onboarding-schema";

export type LearnerDetails = Pick<
  UserProfile,
  | "country"
  | "language"
  | "system"
  | "level"
  | "levelNames"
  | "course"
  | "gradeLevel"
>;

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
