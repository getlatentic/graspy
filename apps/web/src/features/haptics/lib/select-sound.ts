import type { Haptics } from "./create-haptics";

/** What a click chooses: buttons, links (the rows of lists), tabs, switches, options and checkboxes. */
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
].join(",");

/** Put on a control, or on what holds it, to keep its select sound silent (the microphone's button has its own). */
export const NO_SOUND = "data-no-sound";

/**
 * One handler for the whole page: a click that chooses something selects. A
 * click is a pointer, a tap, or Enter or Space on a focused control (a remote's
 * OK key too); focus moving, hovering, scrolling, typing and the remote's arrow
 * keys make no click and so make no cue.
 */
export function installSelectSound(
  haptics: Pick<Haptics, "trigger">,
  root: Document = document,
): () => void {
  const onClick = ({ target }: MouseEvent) => {
    if (!(target instanceof Element)) return;
    const item = target.closest(CHOOSABLE);
    if (!item || item.closest(`[${NO_SOUND}]`)) return;
    if (item.matches(":disabled, [aria-disabled='true']")) return;
    haptics.trigger("select");
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
