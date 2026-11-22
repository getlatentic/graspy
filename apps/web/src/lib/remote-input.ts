import { goBack } from "./back-stack";
import { isBack, isEditable, movesFocus } from "./remote-keys";

/** A pointer that moves right after a key is the page scrolling under a still pointer, not a person. */
const SCROLL_ECHO_MS = 150;

/**
 * Watches how the page is being driven. A key that moves focus puts
 * `data-input="remote"` on <html>, so the focus ring shows even where a TV's
 * browser does not apply :focus-visible; a pointer takes it off again. Back
 * (a remote's key, or Backspace on a TV, never on a control or in a field)
 * closes the topmost popup, leaves a text field, or steps back in the app. A
 * Back key is always swallowed, so the platform's own default (leaving the app)
 * never runs; a held key or a chord only skips the action. Escape is Back on a
 * TV, where a Google or Fire TV remote sends it, and is left to the popups
 * that handle it themselves elsewhere, where it is a keyboard's key.
 */
export function installRemoteInput(root: Document = document): () => void {
  let lastKey = 0;
  const mark = (remote: boolean) => {
    if (remote) root.documentElement.dataset.input = "remote";
    else delete root.documentElement.dataset.input;
  };
  const onTelevision = () => root.documentElement.dataset.device === "tv";

  const onKeyDown = (event: KeyboardEvent) => {
    lastKey = Date.now();
    if (movesFocus(event)) mark(true);
    const tv = onTelevision();
    if (event.key === "Escape" && !tv) return;
    if (!isBack(event, tv)) return;
    event.preventDefault();
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    goBack(window.history, target && isEditable(target) ? target : null);
  };
  const onPointer = (event: Event) => {
    if (event.type === "mousemove" && Date.now() - lastKey < SCROLL_ECHO_MS) {
      return;
    }
    mark(false);
  };

  root.addEventListener("keydown", onKeyDown, true);
  root.addEventListener("pointerdown", onPointer, true);
  root.addEventListener("mousemove", onPointer, true);
  return () => {
    root.removeEventListener("keydown", onKeyDown, true);
    root.removeEventListener("pointerdown", onPointer, true);
    root.removeEventListener("mousemove", onPointer, true);
  };
}
