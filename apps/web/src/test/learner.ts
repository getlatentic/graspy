import type { LearnerPlan } from "@/features/learn/hooks/use-learner-plan";
import type { UserProfile } from "@/lib/user-storage";

/** A learner in a Nigerian class, as the catalogue names it ("nursery-1", "primary-2"). */
export const learnerIn = (level: string): UserProfile => ({
  id: "learner",
  country: "NG",
  language: "en",
  system: "NG",
  level,
  levelNames: null,
  course: "",
  gradeLevel: level,
  preferredSubjects: [],
  createdAt: "",
  updatedAt: "",
  onboardingCompleted: true,
});

/** A saved plan read from the device that holds no class of its own, so the profile's is the
 * learner's. Only what the pages under test read. */
export const loadedPlan = (): LearnerPlan =>
  ({
    curriculum: null,
    isLoaded: true,
    isGenerating: false,
    error: null,
    nextSubject: null,
    generate: () => Promise.resolve(),
  }) as unknown as LearnerPlan;

/** The server's learner_route answer. */
export const routeAnswer = (voiceOnly: boolean) => ({
  content: [],
  structuredContent: { voiceOnly },
});
