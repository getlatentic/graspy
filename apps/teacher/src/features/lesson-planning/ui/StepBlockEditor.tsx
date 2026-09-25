import { TextArea, TextInput } from "@carbon/react";

import { StatusPill } from "../../../ui/StatusPill";
import { replaceAt, updateContentBlock } from "../domain/granularLessonEditing";
import { lines } from "../domain/lessonPlanning";
import { ItemActions } from "./ItemActions";
import type { GranularLessonStep } from "../domain/granularLesson";

/**
 * What each kind of written block is called, and which of its fields opens it.
 *
 * The same three-way choice was made four times over in parallel ternaries —
 * for the heading, the field to write into, its value, and its label — so a new
 * kind of block meant finding all four and a mistake in one showed as a
 * mismatch between them.
 */
const WRITTEN_BLOCKS = {
  explanation: { heading: "Explanation", field: "content", noun: "explanation" },
  worked_example: { heading: "Worked example", field: "problem", noun: "worked example" },
  practice: { heading: "Practice", field: "question", noun: "practice question" },
} as const;

type WrittenBlockType = keyof typeof WRITTEN_BLOCKS;

/**
 * One piece of content inside a lesson step: an explanation, a worked example,
 * a practice question, or a visual from the source material.
 *
 * Which kind it is decides what a teacher writes into, so the kinds are
 * answered here. The step above only knows it holds content in an order.
 */
export function StepBlockEditor({
  block,
  blockIndex,
  step,
  stepNumber,
  index,
  onChange,
  onMoveBlock,
  onRemoveBlock,
}: {
  readonly block: GranularLessonStep["blocks"][number];
  readonly blockIndex: number;
  readonly step: GranularLessonStep;
  /** Which step this is in the lesson, as a teacher counts them. */
  readonly stepNumber: number;
  /** Where the step sits, which its fields' ids are built from. */
  readonly index: number;
  readonly onChange: (nextStep: GranularLessonStep) => void;
  readonly onMoveBlock: (blockId: string, direction: "up" | "down") => void;
  readonly onRemoveBlock: (blockId: string) => void;
}) {

  const contentNumber = blockIndex + 1;
  const controls = (
    <ItemActions
      label={`content ${contentNumber} from lesson step ${stepNumber}`}
      canMoveUp={blockIndex > 0}
      canMoveDown={blockIndex < step.blocks.length - 1}
      canRemove
      onMoveUp={() => onMoveBlock(block.id, "up")}
      onMoveDown={() => onMoveBlock(block.id, "down")}
      onRemove={() => onRemoveBlock(block.id)}
    />
  );
  if (block.type === "visual") {
    return (
      <div className="grid gap-xs border-s-[0.25rem] border-brand bg-paper-soft p-lg" key={block.id}>
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <StatusPill tone="positive" size="sm">Source image</StatusPill>
          {controls}
        </div>
        <strong>{block.caption}</strong>
        <p className="m-0 text-ink-secondary">{block.altText}</p>
      </div>
    );
  }
  const written = WRITTEN_BLOCKS[block.type as WrittenBlockType];
  const firstField = written.field;
  const firstValue = block[firstField as keyof typeof block] as string;
  return (
    <div className="grid gap-lg border-s-[0.25rem] border-brand bg-paper-soft p-lg" key={block.id}>
      <div className="flex flex-wrap items-center justify-between gap-xs">
        <h4 className="m-0 text-ink">{written.heading}</h4>
        {controls}
      </div>
      <TextArea
        id={`granular-block-${index}-${blockIndex}`}
        labelText={`Step ${stepNumber} ${written.noun} ${contentNumber}`}
        rows={4}
        value={firstValue}
        onChange={(event) =>
          onChange({
            ...step,
            blocks: replaceAt(
              step.blocks,
              blockIndex,
              updateContentBlock(block, firstField, event.currentTarget.value),
            ),
          })
        }
      />
      {block.type === "worked_example" ? (
        <>
          {block.steps.map((workedStep, workedStepIndex) => (
            <div className="grid gap-md border-s-[0.25rem] border-rule-strong ps-md sm:grid-cols-2" key={`${block.id}-${workedStepIndex}`}>
              <TextInput
                id={`granular-worked-label-${index}-${blockIndex}-${workedStepIndex}`}
                labelText={`Worked step ${workedStepIndex + 1} label`}
                value={workedStep.label}
                onChange={(event) =>
                  onChange({
                    ...step,
                    blocks: replaceAt(step.blocks, blockIndex, {
                      ...block,
                      steps: replaceAt(block.steps, workedStepIndex, {
                        ...workedStep,
                        label: event.currentTarget.value,
                      }),
                    }),
                  })
                }
              />
              <TextArea
                id={`granular-worked-content-${index}-${blockIndex}-${workedStepIndex}`}
                labelText="Explanation"
                rows={3}
                value={workedStep.content}
                onChange={(event) =>
                  onChange({
                    ...step,
                    blocks: replaceAt(step.blocks, blockIndex, {
                      ...block,
                      steps: replaceAt(block.steps, workedStepIndex, {
                        ...workedStep,
                        content: event.currentTarget.value,
                      }),
                    }),
                  })
                }
              />
            </div>
          ))}
          <TextArea
            id={`granular-block-answer-${index}-${blockIndex}`}
            labelText="Final answer"
            rows={3}
            value={block.finalAnswer}
            onChange={(event) =>
              onChange({
                ...step,
                blocks: replaceAt(step.blocks, blockIndex, updateContentBlock(block, "finalAnswer", event.currentTarget.value)),
              })
            }
          />
        </>
      ) : block.type === "practice" ? (
        <>
          <TextArea
            id={`granular-block-answer-${index}-${blockIndex}`}
            labelText="Expected answer"
            rows={3}
            value={block.expectedAnswer}
            onChange={(event) =>
              onChange({
                ...step,
                blocks: replaceAt(step.blocks, blockIndex, updateContentBlock(block, "expectedAnswer", event.currentTarget.value)),
              })
            }
          />
          <TextArea
            id={`granular-block-hints-${index}-${blockIndex}`}
            labelText="Hints, one per line"
            rows={3}
            value={block.hints.join("\n")}
            onChange={(event) =>
              onChange({
                ...step,
                blocks: replaceAt(step.blocks, blockIndex, updateContentBlock(block, "hints", lines(event.currentTarget.value))),
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}
