import { Button, TextArea } from "@carbon/react";
import { addLessonObjective, moveLessonObjective, removeLessonObjective, replaceAt } from "../domain/granularLessonEditing";
import { ItemActions } from "./ItemActions";
import type { GranularLessonRecord } from "../domain/granularLesson";

/** What learners will be able to do, one goal at a time. */
export function LearningGoalFields({
  plan,
  pending,
  changePlan,
}: {
  readonly plan: GranularLessonRecord["plan"];
  readonly pending: boolean;
  readonly changePlan: (
    update: (value: GranularLessonRecord["plan"]) => GranularLessonRecord["plan"],
  ) => void;
}) {
  return (
            <>
    <div className="grid gap-lg">
                  {plan.lessonObjectives.map((objective, index) => (
                    <div className="grid gap-sm border-t border-rule pt-md" key={objective.id}>
                      <TextArea
                        id={`granular-objective-${index}`}
                        labelText={`Goal ${index + 1}`}
                        rows={3}
                        value={objective.statement}
                        onChange={(event) => {
                          const statement = event.currentTarget.value;
                          changePlan((value) => ({
                            ...value,
                            lessonObjectives: replaceAt(value.lessonObjectives, index, {
                              ...value.lessonObjectives[index],
                              statement,
                            }),
                          }));
                        }}
                      />
                      <ItemActions
                        label={`learning goal ${index + 1}`}
                        canMoveUp={index > 0}
                        canMoveDown={index < plan.lessonObjectives.length - 1}
                        canRemove={plan.lessonObjectives.length > 1}
                        onMoveUp={() =>
                          changePlan((value) =>
                            moveLessonObjective(value, objective.id, "up"),
                          )
                        }
                        onMoveDown={() =>
                          changePlan((value) =>
                            moveLessonObjective(value, objective.id, "down"),
                          )
                        }
                        onRemove={() =>
                          changePlan((value) => removeLessonObjective(value, objective.id))
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    kind="tertiary"
                    disabled={pending || plan.lessonObjectives.length === 0}
                    onClick={() => {
                      const alignment = plan.lessonObjectives.at(-1);
                      if (alignment) {
                        changePlan((value) => addLessonObjective(value, alignment.id));
                      }
                    }}
                  >
                    Add learning goal
                  </Button>
                </div>
            </>
  );
}
