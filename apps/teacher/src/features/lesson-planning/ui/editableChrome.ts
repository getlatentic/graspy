/**
 * How a hand-written lesson's boxes and buttons look.
 *
 * Shared because the editor and its lists are separate components that draw the
 * same controls; a measure restated in two files is a measure that drifts.
 */
export const sectionLabel = "m-0 text-base font-semibold text-ink";
/**
 * A box to write in, with no width of its own.
 *
 * It carried `w-full`, and the one box that wanted to be narrow said `w-24`
 * after it — which does nothing: the order of classes in the attribute is not
 * what decides, Tailwind's own output order is, and `w-full` won. The minutes
 * box spanned the whole row. Every caller states its width now, so a narrow one
 * cannot be quietly overruled.
 */
const writingBox =
  "bg-paper-soft rounded-[8px] min-h-[2.75rem] px-sm py-2xs text-ink leading-body outline-none " +
  "border border-transparent focus:border-brand focus:bg-paper";
export const inlineInput = `${writingBox} w-full`;
/** The same box, sized by the caller. */
export const sizedInput = writingBox;
export const proseInput = `${inlineInput} resize-y`;
export const addButton =
  "inline-flex items-center gap-2xs min-h-[2.75rem] px-md rounded-[10px] border border-rule " +
  "text-brand font-semibold hover:bg-paper-soft";
export const iconButton =
  "grid place-items-center w-11 h-11 flex-none rounded-[8px] text-muted " +
  "hover:bg-paper-soft hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
