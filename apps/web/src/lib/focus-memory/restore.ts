import { focusAndReveal } from "../focus-reveal";
import { findByFocusKey } from "./keys";
import { recall } from "./memory";

/** Whether a control was remembered for the screen. */
export function hasRemembered(route: string): boolean {
  return recall(route) !== null;
}

/** Puts focus back on the control last focused on the screen, if the screen has it now. */
export function restoreFocus(route: string, doc: Document = document): boolean {
  const key = recall(route);
  const el = key ? findByFocusKey(doc, key) : null;
  if (!el) return false;
  focusAndReveal(el);
  return true;
}
