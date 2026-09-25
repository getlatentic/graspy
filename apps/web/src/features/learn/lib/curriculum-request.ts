import type { CurriculumRequest } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";
import { getUserProfile, type UserProfile } from "@/lib/user-storage";
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
