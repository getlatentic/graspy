import {
  initialMode,
  isRealPointer,
  reduce,
  type Mode,
  type Seen,
  type SessionEvent,
} from "./session";

const POINTER_EVENTS = [
  "pointerdown",
  "pointermove",
  "mousedown",
  "mousemove",
  "click",
  "wheel",
  "touchstart",
];

/** A pointer that moves this soon after an arrow is the page moving under it (or a remote parking it), not a person. */
const KEY_ECHO_MS = 150;

export interface Session {
  mode(): Mode;
  apply(event: SessionEvent): void;
  /** Notes that a key was pressed, for the echo rule. */
  keyPressed(): void;
  stop(): void;
}

function startMode(doc: Document): Mode {
  const media = (query: string) =>
    doc.defaultView?.matchMedia?.(query).matches === true;
  return initialMode({
    tv: doc.documentElement.dataset.device === "tv",
    noHover: media("(hover: none)"),
    noPointer: media("(pointer: none)"),
  });
}

/** Watches the document for the events that change the input session. */
export function trackSession(doc: Document): Session {
  let mode: Mode = startMode(doc);
  let seen: Seen | null = null;
  let keyAt = -Infinity;

  const onPointer = (event: Event) => {
    const e = event as MouseEvent & PointerEvent;
    const move = e.type === "pointermove" || e.type === "mousemove";
    if (move && performance.now() - keyAt < KEY_ECHO_MS) return;
    const real = isRealPointer(e, seen);
    if (move) seen = { x: e.clientX, y: e.clientY };
    if (real) mode = reduce(mode, "pointer");
  };
  for (const type of POINTER_EVENTS) {
    doc.addEventListener(type, onPointer, { capture: true, passive: true });
  }

  return {
    mode: () => mode,
    apply: (event) => {
      mode = reduce(mode, event);
    },
    keyPressed: () => {
      keyAt = performance.now();
    },
    stop: () => {
      for (const type of POINTER_EVENTS) {
        doc.removeEventListener(type, onPointer, true);
      }
    },
  };
}
