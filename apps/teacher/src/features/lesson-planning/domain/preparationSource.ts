/**
 * What a draft can be built from: a teaching week's curriculum, its own
 * learning goals, or a plan the teacher pasted.
 */
export type PreparationSource = "scheduled" | "ownGoals" | "pastedPlan";

/** What a lesson has to build from, as the screen knows it. */
export interface PreparationInputs {
  readonly scheduled: boolean;
  readonly hasLearningGoals: boolean;
  readonly fromPastedPlan: boolean;
}

/**
 * Which prompt a draft should show, or `null` when there is nothing to build
 * from yet.
 *
 * First match wins, and the order is the argument: a pasted plan is itself the
 * thing to prepare from, so it needs neither a week nor goals; a week's
 * curriculum is what a scheduled lesson builds against; goals of its own are
 * what an unscheduled one has.
 */
export function preparationSource({
  scheduled,
  hasLearningGoals,
  fromPastedPlan,
}: PreparationInputs): PreparationSource | null {
  if (fromPastedPlan) return "pastedPlan";
  if (scheduled) return "scheduled";
  return hasLearningGoals ? "ownGoals" : null;
}
