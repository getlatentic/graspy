import { Button } from "@carbon/react";
import { addCoreStep } from "../domain/granularLessonEditing";
import { MemoisedStepEditor } from "./GranularStepEditor";
import type { GranularLessonRecord } from "../domain/granularLesson";

/** How the lesson runs, step by step. */
export function LessonFlowFields({
  plan,
  pending,
  sourceFigures,
  changePlan,
}: {
  readonly plan: GranularLessonRecord["plan"];
  readonly pending: boolean;
  readonly sourceFigures: GranularLessonRecord["sourceEvidenceSnapshot"]["figures"];
  readonly changePlan: (
    update: (value: GranularLessonRecord["plan"]) => GranularLessonRecord["plan"],
  ) => void;
}) {
  return (
            <>
    <div className="grid gap-lg">
                  {plan.steps.map((step, index) => (
                    <MemoisedStepEditor
                      key={step.id}
                      index={index}
                      step={step}
                      lessonObjectives={plan.lessonObjectives}
                      sourceFigures={sourceFigures}
                      canMoveUp={index > 1 && step.role === "core"}
                      canMoveDown={
                        index < plan.steps.length - 2 && step.role === "core"
                      }
                      canRemove={
                        step.role === "core" &&
                        plan.steps.filter(
                          ({ role, lessonObjectiveId }) =>
                            role === "core" &&
                            lessonObjectiveId === step.lessonObjectiveId,
                        ).length > 1
                      }
                      changePlan={changePlan}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-xs border-t border-rule pt-md" aria-label="Add a teaching step">
                  {plan.lessonObjectives.map((objective, index) => (
                    <Button
                      key={objective.id}
                      type="button"
                      kind="tertiary"
                      disabled={pending}
                      aria-label={`Add teaching step for goal ${index + 1}`}
                      onClick={() =>
                        changePlan((value) => addCoreStep(value, objective.id))
                      }
                    >
                      Add step for goal {index + 1}
                    </Button>
                  ))}
                </div>
            </>
  );
}
