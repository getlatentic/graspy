/**
 * Puts focus on `el` and scrolls it into view by the least distance. The
 * browser's own scroll on focus is switched off, since it centres the control
 * on some engines and a TV's browser may not do it at all.
 */
export function focusAndReveal(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
