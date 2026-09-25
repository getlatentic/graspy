export const masteryBands = ["remediate", "reinforce", "extend"] as const;
export type MasteryBand = (typeof masteryBands)[number];

export const confidenceScaleLabels = [
  "Not sure at all",
  "A little sure",
  "Somewhat sure",
  "Mostly sure",
  "Very sure",
] as const;

export const difficultyScaleLabels = [
  "Very easy",
  "Easy",
  "Okay",
  "Difficult",
  "Very difficult",
] as const;

export const interestScaleLabels = [
  "Not interested",
  "A little interested",
  "Somewhat interested",
  "Interested",
  "Very interested",
] as const;

export const lessonFeelingScaleLabels = [
  "Very confused",
  "Still unsure",
  "Getting there",
  "Mostly clear",
  "Very clear",
] as const;

export type FivePointScore = 1 | 2 | 3 | 4 | 5;

export interface LearningGoalLearnerState {
  readonly learningGoalNumber: number;
  readonly learningGoal: string;
  readonly masteryScore: number;
  readonly masteryBand: MasteryBand;
  readonly questionsCorrect: number;
  readonly questionsTotal: number;
  readonly commonMisunderstanding: string | null;
  readonly confidenceScore: FivePointScore | null;
  readonly difficultyScore: FivePointScore | null;
}

export interface TeachingGroupLearnerState {
  readonly teachingGroupId: string;
  readonly teachingGroupName: string;
  readonly sessionSignals: {
    readonly interestScore: FivePointScore | null;
    readonly lessonFeelingScore: FivePointScore | null;
  };
  readonly learningGoalStates: readonly LearningGoalLearnerState[];
}

export interface LessonLearnerState {
  readonly lessonVersionId: string;
  readonly evidenceSetId: string;
  readonly evidenceRevision: number;
  readonly teachingGroups: readonly TeachingGroupLearnerState[];
}

export interface ReadinessTier {
  readonly name: string;
  readonly placedBy: string;
}

/**
 * What a teacher is shown for each band, and why a group landed in it.
 *
 * The band itself is decided by the native side and arrives on the snapshot;
 * this only puts the placement into words. `placedBy` therefore describes
 * boundaries defined in `differentiated_classwork::repository::run_lifecycle`,
 * and a Rust test pins them so they cannot move without this prose being
 * updated to match.
 */
export const readinessTiers: Record<MasteryBand, ReadinessTier> = {
  remediate: {
    name: "More guided support",
    placedBy: "fewer than half the exit-test questions were right",
  },
  reinforce: {
    name: "Consolidation",
    placedBy: "between half and three quarters of the exit-test questions were right",
  },
  extend: {
    name: "Further challenge",
    placedBy: "three quarters or more of the exit-test questions were right",
  },
};
