import { memo} from "react";
import { Button, NumberInput, TextArea, TextInput } from "@carbon/react";

import { ItemActions } from "./ItemActions";
import { StepBlockEditor } from "./StepBlockEditor";

import { addContentBlock, addSourceVisualBlock, moveContentBlock, moveCoreStep, removeContentBlock, removeCoreStep, replaceAt } from "../domain/granularLessonEditing";
import type { GranularLessonRecord, GranularLessonStep } from "../domain/granularLesson";
import { lines } from "../domain/lessonPlanning";

function StepEditor({
  index,
  step,
  lessonObjectives,
  sourceFigures,
  canMoveUp,
  canMoveDown,
  canRemove,
  changePlan,
}: {
  readonly index: number;
  readonly step: GranularLessonStep;
  readonly lessonObjectives: GranularLessonRecord["plan"]["lessonObjectives"];
  readonly sourceFigures: GranularLessonRecord["sourceEvidenceSnapshot"]["figures"];
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canRemove: boolean;
  readonly changePlan: (
    update: (value: GranularLessonRecord["plan"]) => GranularLessonRecord["plan"],
  ) => void;
}) {
  const stepNumber = index + 1;
  // Built here rather than at the call site so each row keeps stable handlers
  // and only the edited step re-renders.
  const stepId = step.id;
  const onChange = (nextStep: GranularLessonStep) =>
    changePlan((value) => ({
      ...value,
      steps: replaceAt(value.steps, index, nextStep),
    }));
  const onMove = (direction: "up" | "down") =>
    changePlan((value) => moveCoreStep(value, stepId, direction));
  const onRemove = () => changePlan((value) => removeCoreStep(value, stepId));
  const onAddBlock = (
    type: "explanation" | "worked_example" | "practice",
    lessonObjectiveId?: string,
  ) =>
    changePlan((value) =>
      addContentBlock(value, stepId, type, lessonObjectiveId),
    );
  const onAddSourceVisual = (figure: GranularLessonRecord["sourceEvidenceSnapshot"]["figures"][number]) =>
    changePlan((value) => addSourceVisualBlock(value, stepId, figure));
  const onMoveBlock = (blockId: string, direction: "up" | "down") =>
    changePlan((value) => moveContentBlock(value, stepId, blockId, direction));
  const onRemoveBlock = (blockId: string) =>
    changePlan((value) => removeContentBlock(value, stepId, blockId));
  return (
    <details className="border-t border-rule-strong last:border-b" open={index === 0 || step.title === ""}>
      <summary className="grid min-h-[2.75rem] cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-md p-md text-ink [list-style-position:inside] max-sm:grid-cols-[1.5rem_minmax(0,1fr)]">
        <span className="font-extrabold text-brand">{step.sequence}</span>
        <strong>{step.title}</strong>
        <small className="text-muted max-sm:col-start-2">{step.durationMinutes} minutes</small>
      </summary>
      <div className="grid gap-lg pt-0 pe-md pb-xl ps-[3.75rem] max-sm:ps-md">
        {step.role === "core" ? (
          <ItemActions
            label={`lesson step ${stepNumber}`}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canRemove={canRemove}
            onMoveUp={() => onMove("up")}
            onMoveDown={() => onMove("down")}
            onRemove={onRemove}
          />
        ) : (
          <p className="m-0 text-sm text-muted">
            {step.role === "introduction"
              ? "The introduction stays first."
              : "The final check stays last."}
          </p>
        )}
        <TextInput
          id={`granular-step-title-${index}`}
          labelText={`Step ${stepNumber} title`}
          value={step.title}
          onChange={(event) => onChange({ ...step, title: event.currentTarget.value })}
        />
        <NumberInput
          id={`granular-step-duration-${index}`}
          label="Minutes"
          min={1}
          max={240}
          value={step.durationMinutes}
          onChange={(_event, state) => {
            if (typeof state.value === "number") {
              onChange({ ...step, durationMinutes: state.value });
            }
          }}
        />
        <TextArea
          id={`granular-step-summary-${index}`}
          labelText="Purpose of this step"
          rows={3}
          value={step.summary}
          onChange={(event) => onChange({ ...step, summary: event.currentTarget.value })}
        />
        <TextArea
          id={`granular-step-teacher-${index}`}
          labelText="Teacher actions, one per line"
          rows={5}
          value={step.teacherActivities.join("\n")}
          onChange={(event) =>
            onChange({ ...step, teacherActivities: lines(event.currentTarget.value) })
          }
        />
        <TextArea
          id={`granular-step-learner-${index}`}
          labelText="Learner actions, one per line"
          rows={5}
          value={step.learnerActivities.join("\n")}
          onChange={(event) =>
            onChange({ ...step, learnerActivities: lines(event.currentTarget.value) })
          }
        />
        {step.blocks.map((block, blockIndex) => (
          <StepBlockEditor
            key={block.id}
            block={block}
            blockIndex={blockIndex}
            step={step}
            stepNumber={stepNumber}
            index={index}
            onChange={onChange}
            onMoveBlock={onMoveBlock}
            onRemoveBlock={onRemoveBlock}
          />
        ))}
        <div className="flex flex-wrap items-center gap-xs border-t border-rule pt-md" aria-label={`Add content to lesson step ${stepNumber}`}>
          {step.role !== "evaluation" ? (
            <Button
              type="button"
              kind="ghost"
              aria-label={`Add explanation to lesson step ${stepNumber}`}
              onClick={() => onAddBlock("explanation")}
            >
              Add explanation
            </Button>
          ) : null}
          {step.role === "core" ? (
            <>
              <Button
                type="button"
                kind="ghost"
                aria-label={`Add worked example to lesson step ${stepNumber}`}
                onClick={() => onAddBlock("worked_example")}
              >
                Add worked example
              </Button>
              <Button
                type="button"
                kind="ghost"
                aria-label={`Add practice to lesson step ${stepNumber}`}
                onClick={() => onAddBlock("practice")}
              >
                Add practice
              </Button>
            </>
          ) : null}
          {step.role === "evaluation"
            ? lessonObjectives.map((objective, objectiveIndex) => (
                <Button
                  key={objective.id}
                  type="button"
                  kind="ghost"
                  aria-label={`Add final question for goal ${objectiveIndex + 1}`}
                  onClick={() => onAddBlock("practice", objective.id)}
                >
                  Add question for goal {objectiveIndex + 1}
                </Button>
              ))
            : null}
          {step.role !== "evaluation"
            ? sourceFigures.map((figure) => (
                <Button
                  key={`${figure.sourceRecordId}:${figure.assetFileName}`}
                  type="button"
                  kind="ghost"
                  aria-label={`Add source image ${figure.caption} to lesson step ${stepNumber}`}
                  onClick={() => onAddSourceVisual(figure)}
                >
                  Add source image
                </Button>
              ))
            : null}
        </div>
      </div>
    </details>
  );
}

/// A lesson can carry many steps, each with its own blocks and worked steps.
/// Memoising the row keeps a keystroke in one step from re-rendering them all.
export const MemoisedStepEditor = memo(StepEditor);
