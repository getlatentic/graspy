/**
 * What a key on a keyboard or a television remote means to the app. A remote
 * is five-way (up, down, left, right, OK) with a Back key whose code is not the
 * same on every make: LG webOS sends 461, Samsung Tizen 10009, and Google TV and
 * Fire TV send Escape or the browser's own history back.
 */
export type RemoteKey =
  "up" | "down" | "left" | "right" | "select" | "back" | "home" | "end";

/** Not ours to act on: media keys (rewind 412, stop 413, play 415, pause 19, fast-forward 417) and the colour keys (403 to 406). */
const IGNORED_CODES = new Set([
  412, 413, 415, 19, 417, 403, 404, 405, 406, 457, 10252, 10182,
]);

const BY_KEY: Record<string, RemoteKey> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "select",
  Escape: "back",
  GoBack: "back",
  BrowserBack: "back",
  XF86Back: "back",
  Home: "home",
  End: "end",
};

const BACK_CODES = new Set([461, 10009]);

type KeyLike = Pick<KeyboardEvent, "key" | "keyCode">;

/** A key that moves out of a field of text on a remote, not a letter typed in it. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "radio", "submit", "reset"].includes(
    target.type,
  );
}

/** The meaning of a key event, or null for one the app leaves alone (letters, media and colour keys). */
export function remoteKey(event: KeyLike): RemoteKey | null {
  if (IGNORED_CODES.has(event.keyCode)) return null;
  if (BACK_CODES.has(event.keyCode)) return "back";
  return BY_KEY[event.key] ?? null;
}

/** A control that Backspace does nothing to, and that a person may be pressing keys on. */
const CONTROL =
  "button, select, summary, a[href], [role='button'], [role='option'], [role='combobox']";

/**
 * Whether a key is Back. A remote's Back key always is. Backspace is Back only
 * on a TV, which has no other key for it, and never in a field of text, where
 * it deletes, nor on a control.
 */
export function isBack(
  event: KeyLike & { target: EventTarget | null },
  television = false,
): boolean {
  if (remoteKey(event) === "back") return true;
  if (event.key !== "Backspace" || !television) return false;
  if (isEditable(event.target)) return false;
  return !(event.target instanceof Element && event.target.closest(CONTROL));
}

/** Keys that mean the person is using a remote or a keyboard, not a pointer. */
export function movesFocus(event: KeyLike): boolean {
  const key = remoteKey(event);
  return key !== null || event.key === "Tab" || event.key === " ";
}
