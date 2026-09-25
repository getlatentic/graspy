import { Button, TextArea } from "@carbon/react";

import { StatusPill } from "../../../ui/StatusPill";
import { addAssessment, moveAssessment, removeAssessment, replaceAt } from "../domain/granularLessonEditing";
import { lines } from "../domain/lessonPlanning";
import { ItemActions } from "./ItemActions";
import type { GranularLessonRecord } from "../domain/granularLesson";

/** How each learning goal is checked. */
export function CheckForUnderstandingFields({
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
                  {plan.assessments.map((assessment, index) => (
                    <div className="grid gap-lg border-s-[0.25rem] border-brand bg-paper-soft p-lg" key={assessment.id}>
                      <div className="flex flex-wrap items-center justify-between gap-xs">
                        <StatusPill tone="information" size="sm">
                          Goal {Math.max(1, plan.lessonObjectives.findIndex(({ id }) => id === assessment.lessonObjectiveId) + 1)}
                        </StatusPill>
                        <ItemActions
                          label={`question ${index + 1}`}
                          canMoveUp={index > 0}
                          canMoveDown={index < plan.assessments.length - 1}
                          canRemove={
                            plan.assessments.filter(
                              ({ lessonObjectiveId }) =>
                                lessonObjectiveId === assessment.lessonObjectiveId,
                            ).length > 1
                          }
                          onMoveUp={() =>
                            changePlan((value) =>
                              moveAssessment(value, assessment.id, "up"),
                            )
                          }
                          onMoveDown={() =>
                            changePlan((value) =>
                              moveAssessment(value, assessment.id, "down"),
                            )
                          }
                          onRemove={() =>
                            changePlan((value) =>
                              removeAssessment(value, assessment.id),
                            )
                          }
                        />
                      </div>
                      <TextArea
                        id={`granular-assessment-question-${index}`}
                        labelText={`Question ${index + 1}`}
                        rows={3}
                        value={assessment.question}
                        onChange={(event) => {
                          const question = event.currentTarget.value;
                          changePlan((value) => ({
                              ...value,
                              assessments: replaceAt(value.assessments, index, {
                                ...value.assessments[index],
                                question,
                              }),
                            }));
                        }}
                      />
                      <TextArea
                        id={`granular-assessment-answer-${index}`}
                        labelText="Expected answer"
                        rows={3}
                        value={assessment.expectedAnswer}
                        onChange={(event) => {
                          const expectedAnswer = event.currentTarget.value;
                          changePlan((value) => ({
                              ...value,
                              assessments: replaceAt(value.assessments, index, {
                                ...value.assessments[index],
                                expectedAnswer,
                              }),
                            }));
                        }}
                      />
                      <TextArea
                        id={`granular-assessment-rubric-${index}`}
                        labelText="What a successful answer includes, one point per line"
                        rows={4}
                        value={assessment.rubric.join("\n")}
                        onChange={(event) => {
                          const rubric = lines(event.currentTarget.value);
                          changePlan((value) => ({
                              ...value,
                              assessments: replaceAt(value.assessments, index, {
                                ...value.assessments[index],
                                rubric,
                              }),
                            }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-xs border-t border-rule pt-md" aria-label="Add a question">
                  {plan.lessonObjectives.map((objective, index) => (
                    <Button
                      key={objective.id}
                      type="button"
                      kind="tertiary"
                      disabled={pending}
                      aria-label={`Add question for goal ${index + 1}`}
                      onClick={() =>
                        changePlan((value) => addAssessment(value, objective.id))
                      }
                    >
                      Add question for goal {index + 1}
                    </Button>
                  ))}
                </div>
            </>
  );
}
