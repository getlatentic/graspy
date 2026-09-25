import type { LessonBlock } from "../domain/lessonContent";
import { BLOCK_KINDS } from "./blockKinds";
import { inlineInput, proseInput } from "./editableChrome";

export function BlockFields({
  block,
  onChange,
}: {
  readonly block: LessonBlock;
  readonly onChange: (block: LessonBlock) => void;
}) {
  const { prose, answer } = BLOCK_KINDS[block.type];
  const write = (field: string) => (event: { currentTarget: { value: string } }) =>
    onChange({ ...block, [field]: event.currentTarget.value } as LessonBlock);
  const proseBox = (
    <textarea
      className={proseInput}
      aria-label={prose.label}
      placeholder={prose.placeholder}
      value={block[prose.field as keyof LessonBlock] as string}
      onChange={write(prose.field)}
    />
  );
  // An explanation is the box alone. Wrapping it as well would hand its parent
  // a different child to lay out, which is a look changed by a tidy-up.
  if (!answer) return proseBox;
  return (
    <div className="grid gap-sm">
      {proseBox}
      <input
        className={inlineInput}
        aria-label={answer.label}
        placeholder="The answer."
        value={block[answer.field as keyof LessonBlock] as string}
        onChange={write(answer.field)}
      />
    </div>
  );
}
