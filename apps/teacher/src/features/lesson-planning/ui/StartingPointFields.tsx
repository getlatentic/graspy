import { TextArea } from "@carbon/react";
import { replaceAt } from "../domain/granularLessonEditing";
import type { GranularLessonRecord } from "../domain/granularLesson";

/** What learners already know, and where they usually go wrong. */
export function StartingPointFields({
  plan,
  changePlan,
}: {
  readonly plan: GranularLessonRecord["plan"];
  readonly changePlan: (
    update: (value: GranularLessonRecord["plan"]) => GranularLessonRecord["plan"],
  ) => void;
}) {
  return (
            <>
    <div className="grid gap-lg">
                  {plan.priorKnowledge.map((item, index) => (
                    <TextArea
                      key={item.id}
                      id={`granular-prior-${index}`}
                      labelText={`What learners should already know ${index + 1}`}
                      rows={3}
                      value={item.statement}
                      onChange={(event) => {
                        const statement = event.currentTarget.value;
                        changePlan((value) => ({
                            ...value,
                            priorKnowledge: replaceAt(value.priorKnowledge, index, {
                              ...value.priorKnowledge[index],
                              statement,
                            }),
                          }));
                      }}
                    />
                  ))}
                  {plan.misconceptions.map((item, index) => (
                    <div className="grid gap-md border-s-[0.25rem] border-rule-strong ps-md sm:grid-cols-2" key={item.id}>
                      <TextArea
                        id={`granular-misconception-${index}`}
                        labelText={`Likely misunderstanding ${index + 1}`}
                        rows={3}
                        value={item.statement}
                        onChange={(event) => {
                          const statement = event.currentTarget.value;
                          changePlan((value) => ({
                              ...value,
                              misconceptions: replaceAt(value.misconceptions, index, {
                                ...value.misconceptions[index],
                                statement,
                              }),
                            }));
                        }}
                      />
                      <TextArea
                        id={`granular-correction-${index}`}
                        labelText="How to address it"
                        rows={3}
                        value={item.correction}
                        onChange={(event) => {
                          const correction = event.currentTarget.value;
                          changePlan((value) => ({
                              ...value,
                              misconceptions: replaceAt(value.misconceptions, index, {
                                ...value.misconceptions[index],
                                correction,
                              }),
                            }));
                        }}
                      />
                    </div>
                  ))}
                </div>
            </>
  );
}
