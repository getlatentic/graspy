import type { LessonContent } from "../domain/lessonContent";
import { addButton, inlineInput, proseInput, sectionLabel } from "./editableChrome";
import { EditableList } from "./EditableList";
import { EditableStep } from "./EditableStep";
import {
  addCheck,
  addInstructionalMaterial,
  addObjective,
  addStep,
  moveCheck,
  moveInstructionalMaterial,
  moveObjective,
  removeCheck,
  removeInstructionalMaterial,
  removeObjective,
  updateCheck,
  updateInstructionalMaterial,
  updateObjective,
} from "../domain/lessonContentEditing";

/**
 * The same lesson, written rather than read.
 *
 * It keeps the read surface's shape — goals, what to bring, the timed steps and
 * the checks — and turns each into something a teacher edits in place, so writing
 * a lesson feels like writing a lesson and not filling a form. Nothing empty is
 * stacked up in advance: a section shows what is there and a way to add the next
 * thing, so the lesson grows under the teacher rather than confronting them.
 */


export function EditableLesson({
  content,
  onChange,
}: {
  readonly content: LessonContent;
  readonly onChange: (content: LessonContent) => void;
}) {
  return (
    <div className="grid gap-2xl box-border w-full px-lg pt-xl pb-2xl text-base leading-body">
      <EditableList
        section={{
          id: "editable-goals",
          heading: "What learners will be able to do",
          noun: "learning goal",
          addLabel: "Add goal",
        }}
        items={content.objectives}
        edit={{
          move: (index, direction) => moveObjective(content, index, direction),
          remove: (index) => removeObjective(content, index),
          add: () => addObjective(content),
        }}
        onChange={onChange}
      >
        {(statement, index) => (
          <input
            className={inlineInput}
            aria-label={`Learning goal ${index + 1}`}
            placeholder="A goal for this lesson."
            value={statement}
            onChange={(event) => onChange(updateObjective(content, index, event.currentTarget.value))}
          />
        )}
      </EditableList>

      <EditableList
        section={{
          id: "editable-instructional-materials",
          heading: "What to bring",
          noun: "material",
          addLabel: "Add material",
        }}
        items={content.instructionalMaterials}
        edit={{
          move: (index, direction) => moveInstructionalMaterial(content, index, direction),
          remove: (index) => removeInstructionalMaterial(content, index),
          add: () => addInstructionalMaterial(content),
        }}
        onChange={onChange}
      >
        {(material, index) => (
          <input
            className={inlineInput}
            aria-label={`Material ${index + 1}`}
            placeholder="Something to bring to class."
            value={material}
            onChange={(event) => onChange(updateInstructionalMaterial(content, index, event.currentTarget.value))}
          />
        )}
      </EditableList>

      <section className="grid gap-md" aria-labelledby="editable-flow">
        <h3 className={sectionLabel} id="editable-flow">
          How the lesson runs
        </h3>
        <ol className="grid gap-md m-0 p-0 list-none">
          {content.steps.map((step, index) => (
            <li className="grid gap-sm border border-rule rounded-[10px] p-md" key={step.id}>
              <EditableStep content={content} step={step} index={index} onChange={onChange} />
            </li>
          ))}
        </ol>
        <button type="button" className={addButton} onClick={() => onChange(addStep(content))}>
          Add step
        </button>
      </section>

      <EditableList
        section={{
          id: "editable-checks",
          heading: "Homework",
          noun: "homework question",
          addLabel: "Add a homework question",
          spacing: "md",
        }}
        items={content.checks}
        keyOf={(check) => check.id}
        edit={{
          move: (index, direction) => moveCheck(content, content.checks[index].id, direction),
          remove: (index) => removeCheck(content, content.checks[index].id),
          add: () => addCheck(content),
        }}
        onChange={onChange}
      >
        {(check, index) => (
          <div className="grid gap-2xs flex-1 min-w-0">
            <textarea
              className={proseInput}
              aria-label={`Check ${index + 1} question`}
              placeholder="A question pupils answer at home."
              value={check.question}
              onChange={(event) => onChange(updateCheck(content, check.id, { question: event.currentTarget.value }))}
            />
            <input
              className={inlineInput}
              aria-label={`Check ${index + 1} answer`}
              placeholder="The answer."
              value={check.expectedAnswer}
              onChange={(event) =>
                onChange(updateCheck(content, check.id, { expectedAnswer: event.currentTarget.value }))
              }
            />
          </div>
        )}
      </EditableList>
    </div>
  );
}


