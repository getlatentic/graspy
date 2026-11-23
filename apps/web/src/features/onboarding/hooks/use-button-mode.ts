import { useState } from "react";

/**
 * Whether a select is a button that opens a list (read-only, no text keyboard)
 * rather than a text field that filters: on a TV and on a screen whose main
 * pointer is a finger or that cannot hover. A desktop with a mouse and a
 * keyboard keeps the text field.
 */
export function wantsButtonMode(
  root: HTMLElement = document.documentElement,
  media: Pick<Window, "matchMedia"> = window,
): boolean {
  if (root.dataset.device === "tv") return true;
  const matches = (query: string) => media.matchMedia?.(query).matches === true;
  return matches("(pointer: coarse)") || matches("(hover: none)");
}

/** Read once, when the field is first shown: a device does not change its kind while a form is open. */
export function useButtonMode(): boolean {
  const [buttonMode] = useState(() =>
    typeof document === "undefined" ? false : wantsButtonMode(),
  );
  return buttonMode;
}
