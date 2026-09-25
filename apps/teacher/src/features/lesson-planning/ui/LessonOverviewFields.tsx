import { TextArea, TextInput } from "@carbon/react";
import { lines } from "../domain/lessonPlanning";
import type { GranularLessonRecord } from "../domain/granularLesson";

/** The lesson's title and what to bring to it. */
export function LessonOverviewFields({
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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg sm:grid-cols-2">
                  <TextInput
                    id="granular-lesson-topic"
                    labelText="Lesson topic"
                    required
                    maxLength={160}
                    value={plan.topic}
                    onChange={(event) => {
                      const topic = event.currentTarget.value;
                      changePlan((value) => ({ ...value, topic }));
                    }}
                  />
                  <TextInput
                    id="granular-lesson-subtopic"
                    labelText="Subtopic (optional)"
                    maxLength={160}
                    value={plan.subtopic ?? ""}
                    onChange={(event) => {
                      const subtopic = event.currentTarget.value.trim() || null;
                      changePlan((value) => ({ ...value, subtopic }));
                    }}
                  />
                </div>
                <TextArea
                  id="granular-instructional-materials"
                  labelText="Instructional materials, one per line"
                  rows={5}
                  value={plan.materials.join("\n")}
                  onChange={(event) => {
                    const materials = lines(event.currentTarget.value);
                    changePlan((value) => ({ ...value, materials }));
                  }}
                />
            </>
  );
}
