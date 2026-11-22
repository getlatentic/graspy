import { goBack } from "./back-stack";
import { isBack, movesFocus, remoteKey } from "./remote-keys";

/**
 * Watches how the page is being driven. A key that moves focus puts
 * `data-input="remote"` on <html>, so the focus ring shows even where a TV's
 * browser does not apply :focus-visible; a pointer takes it off again. Back
 * (a remote's key, or Backspace outside a field) closes the topmost popup or
 * steps back in the app, and Escape is left to the popups that handle it
 * themselves.
 */
export function installRemoteInput(root: Document = document): () => void {
  const mark = (remote: boolean) => {
    if (remote) root.documentElement.dataset.input = "remote";
    else delete root.documentElement.dataset.input;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (movesFocus(event)) mark(true);
    if (!isBack(event) || event.key === "Escape") return;
    if (remoteKey(event) === null && event.key !== "Backspace") return;
    event.preventDefault();
    goBack();
  };
  const onPointer = (event: Event) => {
    // A page that scrolls under a still pointer sends mousemove with no movement.
    if (event instanceof MouseEvent && event.type === "mousemove") {
      if (!event.movementX && !event.movementY) return;
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
