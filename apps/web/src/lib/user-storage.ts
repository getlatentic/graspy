// localStorage, not IndexedDB: it is read synchronously at startup.
import { ON_MY_OWN, type LearnerLevel } from "./learner-level";

export interface UserProfile extends LearnerLevel {
  id: string;
  country: string;
  language: string;
  /** The level as the server reads it: see schoolDescriptor. */
  gradeLevel: string;
  /** An earlier version's school year, until placeEarlierClass places it. */
  earlierYear?: number;
  preferredSubjects: string[];
  createdAt: string;
  updatedAt: string;
  onboardingCompleted: boolean;
}

/** What the learner said about themselves: their plan is written for these. */
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

const USER_PROFILE_KEY = "graspy_user_profile";

const listeners = new Set<() => void>();

export function onProfileSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** The level fields of a profile an earlier version saved. */
interface EarlierLevel {
  stage?: string;
  schoolGrade?: string;
  universityYear?: string;
}

/** "grade_10" is the tenth school year, counted from the first of primary. */
function earlierYear(profile: EarlierLevel): number | undefined {
  const year = Number(/^grade_(\d+)$/.exec(profile.schoolGrade ?? "")?.[1]);
  return year > 0 ? year : undefined;
}

/** A class at school stays unset: gradeLevel shows it until it is placed. */
function earlierLevel(profile: EarlierLevel): string {
  if (profile.stage === "university") {
    return profile.universityYear === "postgraduate"
      ? "graduate"
      : "undergraduate";
  }
  return profile.stage === "self" ? ON_MY_OWN : "";
}

function levelOf(
  profile: Partial<UserProfile> & EarlierLevel,
): LearnerLevel & Pick<UserProfile, "earlierYear"> {
  return {
    system: profile.system ?? "",
    level: profile.level ?? earlierLevel(profile),
    levelNames: profile.levelNames ?? null,
    earlierYear: profile.earlierYear ?? earlierYear(profile),
    course: profile.course ?? "",
  };
}

function withDefaults(
  profile: Partial<UserProfile> & EarlierLevel,
): UserProfile {
  const now = new Date().toISOString();
  return {
    id: profile.id ?? generateUserId(),
    country: profile.country ?? "",
    language: profile.language ?? "",
    gradeLevel: profile.gradeLevel ?? "",
    ...levelOf(profile),
    preferredSubjects: Array.isArray(profile.preferredSubjects)
      ? profile.preferredSubjects
      : [],
    createdAt: profile.createdAt ?? now,
    updatedAt: profile.updatedAt ?? now,
    onboardingCompleted: profile.onboardingCompleted ?? false,
  };
}

export function saveUserProfile(profile: Partial<UserProfile>): UserProfile {
  const existing = getUserProfile();
  const now = new Date().toISOString();
  const saved = withDefaults({
    ...existing,
    ...profile,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(saved));
  for (const listener of listeners) listener();
  return saved;
}

export function getUserProfile(): UserProfile | null {
  try {
    const stored = localStorage.getItem(USER_PROFILE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<UserProfile> & EarlierLevel;
    const profile = withDefaults(parsed);
    // An earlier version's profile is rewritten once, without its old fields.
    if (!("level" in parsed)) {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    }
    return profile;
  } catch (error) {
    console.error("Error reading user profile:", error);
    return null;
  }
}

export function hasCompletedOnboarding(): boolean {
  const profile = getUserProfile();
  return profile?.onboardingCompleted ?? false;
}
