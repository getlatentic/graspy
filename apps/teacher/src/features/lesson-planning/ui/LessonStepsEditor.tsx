import { Button, TextArea, TextInput } from "@carbon/react";

import { emptyEditableStep, isStartedStep, type EditableStep } from "./lessonStepDraft";
import { WritableSection } from "./WritableSection";

/** How the lesson will be taught, step by step — the presentation on a plan. */
export function LessonStepsEditor({
  steps,
  onStepsChange,
}: {
  readonly steps: EditableStep[];
  readonly onStepsChange: (steps: EditableStep[]) => void;
}) {
  const updateStep = (index: number, update: Partial<EditableStep>) =>
    onStepsChange(
      steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...update } : step)),
    );

  return (
    <WritableSection title="Teaching steps" open={steps.some(isStartedStep)}>
      <div className="grid gap-lg pt-lg">
        <div className="grid gap-lg">
          {steps.map((step, index) => (
            <StepFields
              key={index}
              step={step}
              index={index}
              onChange={(update) => updateStep(index, update)}
              onRemove={
                steps.length > 1
                  ? () => onStepsChange(steps.filter((_, stepIndex) => stepIndex !== index))
                  : null
              }
            />
          ))}
        </div>
        <Button
          type="button"
          kind="tertiary"
          onClick={() => onStepsChange([...steps, emptyEditableStep()])}
        >
          Add step
        </Button>
      </div>
    </WritableSection>
  );
}

function StepFields({
  step,
  index,
  onChange,
  onRemove,
}: {
  readonly step: EditableStep;
  readonly index: number;
  readonly onChange: (update: Partial<EditableStep>) => void;
  readonly onRemove: (() => void) | null;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg border border-rule bg-paper-soft p-lg sm:grid-cols-2 [&_.cds--text-input]:min-h-[2.75rem]">
      <legend className="mb-md p-0 font-extrabold text-ink sm:col-span-full">
        Step {index + 1}
      </legend>
      <TextInput
        id={`lesson-step-${index}-title`}
        labelText="Step title"
        value={step.title}
        onChange={(event) => onChange({ title: event.currentTarget.value })}
      />
      <TextArea
        id={`lesson-step-${index}-teacher`}
        labelText="Teacher activity"
        rows={2}
        value={step.teacherActivity}
        onChange={(event) => onChange({ teacherActivity: event.currentTarget.value })}
      />
      <TextArea
        id={`lesson-step-${index}-learner`}
        labelText="Learner activity"
        rows={2}
        value={step.learnerActivity}
        onChange={(event) => onChange({ learnerActivity: event.currentTarget.value })}
      />
      <TextInput
        id={`lesson-step-${index}-duration`}
        labelText="Minutes (optional)"
        type="number"
        min={1}
        max={240}
        value={step.durationMinutes}
        onChange={(event) => onChange({ durationMinutes: event.currentTarget.value })}
      />
      {onRemove ? (
        <Button type="button" kind="danger--ghost" onClick={onRemove}>
          Remove step
        </Button>
      ) : null}
    </fieldset>
  );
}
