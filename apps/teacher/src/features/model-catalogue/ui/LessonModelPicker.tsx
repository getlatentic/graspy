import { InlineNotification, RadioButton, RadioButtonGroup } from "@carbon/react";

import { formatFileSize } from "../../model-acquisition/domain/modelAcquisition";
import { isWorthChoosing, memoryGuidance } from "../domain/lessonModel";
import type { LessonModelController } from "./useLessonModels";

interface LessonModelPickerProps {
  readonly controller: LessonModelController;
}

/**
 * Lets a teacher on a slower computer trade lesson depth for a smaller download
 * and less memory.
 *
 * Renders nothing when there is only one option, because a picker with one row
 * asks a teacher to weigh a decision that has already been made for them.
 */
export function LessonModelPicker({ controller }: LessonModelPickerProps) {
  if (!isWorthChoosing(controller.choices)) return null;

  const selected = controller.choices.find((choice) => choice.isSelected);

  return (
    <section
      className="mt-lg grid gap-md border-t border-rule-strong pt-lg"
      aria-labelledby="lesson-model-title"
    >
      <div>
        <p className="m-0 mb-xs text-sm font-extrabold text-accent">
          This computer
        </p>
        <h3
          className="m-0 text-md font-extrabold leading-heading text-ink"
          id="lesson-model-title"
        >
          How much should graspy do on this computer?
        </h3>
      </div>

      {controller.failure ? (
        <InlineNotification
          className="w-full max-w-none"
          kind="error"
          lowContrast
          hideCloseButton
          title="That choice was not saved"
          subtitle={controller.failure}
        />
      ) : null}

      <RadioButtonGroup
        name="lesson-model"
        legendText="Lesson writing"
        orientation="vertical"
        valueSelected={selected?.id}
        onChange={(value) => {
          if (typeof value === "string") void controller.choose(value);
        }}
      >
        {controller.choices.map((choice) => (
          <RadioButton
            key={choice.id}
            id={`lesson-model-${choice.id}`}
            value={choice.id}
            disabled={controller.changing || !choice.fitsThisMachine}
            labelText={
              <span className="grid gap-3xs py-2xs">
                <span className="font-bold text-ink">{choice.displayName}</span>
                <span className="text-sm leading-body text-ink-secondary">
                  {choice.summary}
                </span>
                <span className="text-sm leading-body text-muted">
                  {memoryGuidance(choice)}{" "}
                  {choice.isInstalled
                    ? "Already on this computer."
                    : `${formatFileSize(choice.downloadBytes)} to add.`}
                </span>
              </span>
            }
          />
        ))}
      </RadioButtonGroup>
    </section>
  );
}
