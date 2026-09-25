import type { LessonBlock, LessonContent } from "../domain/lessonContent";
import {
  addStepBlock,
  moveStep,
  moveStepBlock,
  removeStep,
  removeStepBlock,
  setStepBlock,
  updateStep,
} from "../domain/lessonContentEditing";
import { BlockFields } from "./BlockFields";
import { BLOCK_CHOICES, BLOCK_KINDS } from "./blockKinds";
import { addButton, inlineInput, proseInput, sizedInput } from "./editableChrome";
import { ItemControls } from "./ItemControls";

/** What a control calls the block it acts on. */
function blockLabel(block: LessonBlock): string {
  return BLOCK_KINDS[block.type].noun;
}

/**
 * One step of a lesson: what it is called, how long it takes, what it is for,
 * and the explanations, worked examples and practice inside it.
 *
 * Not one of the shared lists, deliberately. Its row is a card with the
 * controls inside its own header and a list of blocks nested within it, where
 * the goals, instructional materials and checks put their controls beside a single row.
 */
export function EditableStep({
  content,
  step,
  index,
  onChange,
}: {
  readonly content: LessonContent;
  readonly step: LessonContent["steps"][number];
  readonly index: number;
  readonly onChange: (content: LessonContent) => void;
}) {
  return (
    <>
              <div className="flex items-start gap-sm">
                <div className="grid gap-2xs flex-1 min-w-0">
                  <input
                    className={`${inlineInput} font-semibold`}
                    aria-label={`Step ${index + 1} title`}
                    placeholder="What happens in this step."
                    value={step.title}
                    onChange={(event) => onChange(updateStep(content, step.id, { title: event.currentTarget.value }))}
                  />
                  <div className="flex items-center gap-sm">
                    <input
                      className={`${sizedInput} w-24`}
                      type="number"
                      min={1}
                      aria-label={`Step ${index + 1} minutes`}
                      placeholder="Minutes"
                      value={step.durationMinutes ?? ""}
                      onChange={(event) =>
                        onChange(
                          updateStep(content, step.id, {
                            durationMinutes: event.currentTarget.value
                              ? Number(event.currentTarget.value)
                              : null,
                          }),
                        )
                      }
                    />
                    <span className="text-sm text-muted">min</span>
                  </div>
                </div>
                <ItemControls
                  label={`step ${index + 1}`}
                  index={index}
                  count={content.steps.length}
                  onMove={(direction) => onChange(moveStep(content, step.id, direction))}
                  onRemove={() => onChange(removeStep(content, step.id))}
                />
              </div>

              <textarea
                className={proseInput}
                aria-label={`Step ${index + 1} summary`}
                placeholder="A line on what this step is for."
                value={step.summary}
                onChange={(event) => onChange(updateStep(content, step.id, { summary: event.currentTarget.value }))}
              />

              {step.blocks.map((block, blockIndex) => (
                <div className="flex items-start gap-sm" key={block.id}>
                  <div className="flex-1 min-w-0">
                    <BlockFields
                      block={block}
                      onChange={(next) => onChange(setStepBlock(content, step.id, next))}
                    />
                  </div>
                  <ItemControls
                    label={`${blockLabel(block)} in step ${index + 1}`}
                    index={blockIndex}
                    count={step.blocks.length}
                    onMove={(direction) => onChange(moveStepBlock(content, step.id, block.id, direction))}
                    onRemove={() => onChange(removeStepBlock(content, step.id, block.id))}
                  />
                </div>
              ))}

              <div className="flex flex-wrap gap-sm">
                {BLOCK_CHOICES.map((choice) => (
                  <button
                    type="button"
                    key={choice.type}
                    className={addButton}
                    onClick={() => onChange(addStepBlock(content, step.id, choice.type))}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
    </>
  );
}
