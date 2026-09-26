import {
  afterSchoolDescriptor,
  isAfterSchool,
  levelComplete,
} from "@/lib/learner-level";
import type { LearnerDetails, UserProfile } from "@/lib/user-storage";
import { voiceOnly } from "@/lib/voice/voice-learner";
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

/** What saving new details does to the plan. A class that learns by voice alone shows no
 * subjects, so its plan only takes the details, and it has none worth keeping for another
 * class; otherwise the learner chooses. */
export function detailsSave(
  profile: UserProfile,
  details: DetailsSchema,
): "keep" | "new" | "ask" {
  if (voiceOnly(learnerDetails(details))) return "keep";
  return voiceOnly(profile) ? "new" : "ask";
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
