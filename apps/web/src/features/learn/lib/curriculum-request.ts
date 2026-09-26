import type { CurriculumRequest } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";
import { getUserProfile, type UserProfile } from "@/lib/user-storage";
import { classOf, voiceOnly } from "@/lib/voice/voice-learner";
import { pathsOf } from "./curriculum-edit";

export function curriculumRequest(
  profile: UserProfile,
  subjects: string[] = profile.preferredSubjects,
): CurriculumRequest {
  return {
    country: profile.country,
    language: profile.language,
    gradeLevel: profile.gradeLevel,
    subjects,
  };
}

/** Whether a plan is still to be made: the learner has no subjects, and their class learns from slides. */
export const planWanted = (
  curriculum: CurriculumData | null,
  profile: UserProfile,
): boolean =>
  !curriculum?.subjects.length &&
  !voiceOnly(classOf(curriculum, profile) ?? profile);

/** Paths are left out: they stay as the learner accepted them. */
export function rebuildRequest(
  curriculum: CurriculumData,
): CurriculumRequest | null {
  const profile = getUserProfile();
  const paths = new Set(pathsOf(curriculum));
  const names = curriculum.subjects
    .filter((subject) => !paths.has(subject))
    .map((subject) => subject.name);
  // An empty list asks the server to invent a whole curriculum.
  return profile && names.length > 0 ? curriculumRequest(profile, names) : null;
}
