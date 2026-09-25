import { LessonEditingStep } from "./LessonEditingStep";
import { LessonOverviewFields } from "./LessonOverviewFields";
import { LearningGoalFields } from "./LearningGoalFields";
import { StartingPointFields } from "./StartingPointFields";
import { LessonFlowFields } from "./LessonFlowFields";
import { CheckForUnderstandingFields } from "./CheckForUnderstandingFields";
import type { GranularLessonRecord } from "../domain/granularLesson";

/**
 * The lesson as a form a teacher fills in, step by step.
 *
 * Five numbered steps, each its own concern: what the lesson is, what learners
 * will be able to do, what they already know, how the lesson runs, and how it
 * is checked.
 */
export function LessonEditingForm({
  plan,
  editing,
  pending,
  sourceFigures,
  changePlan,
}: {
  readonly plan: GranularLessonRecord["plan"];
  /** The steps stay mounted while reading, hidden, so nothing typed is lost. */
  readonly editing: boolean;
  /** An action is in flight, so the form's own controls stand down. */
  readonly pending: boolean;
  readonly sourceFigures: GranularLessonRecord["sourceEvidenceSnapshot"]["figures"];
  readonly changePlan: (
    update: (value: GranularLessonRecord["plan"]) => GranularLessonRecord["plan"],
  ) => void;
}) {
  // Numbered by position rather than by hand, so a step cannot claim to be
  // third while sitting second, and hidden once rather than five times.
  const steps = [
    {
      id: "lesson-overview",
      title: "Lesson overview",
      description: "Set the title and the instructional materials you will need.",
      content: <LessonOverviewFields plan={plan} changePlan={changePlan} />,
    },
    {
      id: "lesson-goals",
      title: "Learning goals",
      description: "Keep each goal observable and specific.",
      content: <LearningGoalFields plan={plan} pending={pending} changePlan={changePlan} />,
    },
    {
      id: "lesson-readiness",
      title: "Starting point",
      description: "Review what learners should already know and likely misunderstandings.",
      content: <StartingPointFields plan={plan} changePlan={changePlan} />,
    },
    {
      id: "lesson-flow",
      title: "Lesson flow",
      description: "Check the sequence, timing, teacher actions, learner actions, and practice.",
      content: (
        <LessonFlowFields
          plan={plan}
          pending={pending}
          sourceFigures={sourceFigures}
          changePlan={changePlan}
        />
      ),
    },
    {
      id: "lesson-checks",
      title: "Homework",
      description: "What pupils take home, each question linked to a learning goal.",
      content: (
        <CheckForUnderstandingFields plan={plan} pending={pending} changePlan={changePlan} />
      ),
    },
  ];
  return (
    <>
      {steps.map(({ id, title, description, content }, index) => (
        <LessonEditingStep
          key={id}
          step={index + 1}
          id={id}
          title={title}
          description={description}
          hidden={!editing}
        >
          {content}
        </LessonEditingStep>
      ))}
    </>
  );
}

