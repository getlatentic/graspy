import type { Haptics } from "./create-haptics";

/** What a click chooses: buttons, links (the rows of lists), tabs, switches, options, checkboxes and a select's field (which opens its list). */
const CHOOSABLE = [
  "button",
  "a[href]",
  "summary",
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="combobox"]',
].join(",");

/** Put on a control, or on what holds it, to keep its select sound silent (the microphone's button has its own). */
export const NO_SOUND = "data-no-sound";

const COMBOBOX = '[role="combobox"]';

const isOpen = (field: Element) =>
  field.getAttribute("aria-expanded") === "true";

/**
 * One handler for the whole page: a click that chooses something selects. A
 * click is a pointer, a tap, or Enter or Space on a focused control (a remote's
 * OK key too); focus moving, hovering, scrolling, typing and the remote's arrow
 * keys make no click and so make no cue. A select's field ticks only when the
 * press opens its list: a press focuses the field, and that opens the list
 * before the click comes, so whether it was open is read when the press begins;
 * a click on an open field (the cursor in a text field) is silent.
 */
export function installSelectSound(
  haptics: Pick<Haptics, "trigger">,
  root: Document = document,
): () => void {
  let openAtPress: boolean | null = null;
  const onPress = ({ target }: Event) => {
    const field = target instanceof Element ? target.closest(COMBOBOX) : null;
    openAtPress = field ? isOpen(field) : null;
  };
  const onClick = ({ target }: MouseEvent) => {
    const wasOpen = openAtPress;
    openAtPress = null;
    if (!(target instanceof Element)) return;
    const item = target.closest(CHOOSABLE);
    if (!item || item.closest(`[${NO_SOUND}]`)) return;
    if (item.matches(":disabled, [aria-disabled='true']")) return;
    if (item.matches(COMBOBOX) && (wasOpen ?? isOpen(item))) return;
    haptics.trigger("select");
  };
  root.addEventListener("pointerdown", onPress, true);
  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("pointerdown", onPress, true);
    root.removeEventListener("click", onClick);
  };
}
