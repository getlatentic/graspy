import { describeElement } from "./describe";

export const LOG_SIZE = 50;

export interface LogEntry {
  /** Milliseconds since the page started listening. */
  at: number;
  text: string;
  /** How many identical moves were folded into this one. */
  count: number;
}

/** Events that arrive in floods; a run of them is one line with a count. */
const FOLDED = new Set(["pointermove", "mousemove", "wheel"]);

const KEY_EVENTS = ["keydown", "keyup"] as const;
const POINTER_EVENTS = [
  "pointerdown",
  "pointerup",
  "pointercancel",
  "pointermove",
  "click",
  "wheel",
] as const;

/** One line for an event: keys give key, code, keyCode and repeat; pointers their type; focus the element. */
export function describeEvent(event: Event): string {
  if (event instanceof KeyboardEvent) {
    return `${event.type} key=${JSON.stringify(event.key)} code=${JSON.stringify(event.code)} keyCode=${event.keyCode} repeat=${event.repeat}`;
  }
  if (event.type === "focusin") {
    return `focus ${describeElement(event.target)}`;
  }
  const pointerType = (event as PointerEvent).pointerType;
  return pointerType ? `${event.type} pointerType=${pointerType}` : event.type;
}

/** The log with `entry` added: newest first, at most LOG_SIZE, a run of one kind of flood event folded. */
export function appended(
  log: readonly LogEntry[],
  entry: LogEntry,
  folds: boolean,
): LogEntry[] {
  const [latest, ...older] = log;
  if (folds && latest && latest.text === entry.text) {
    return [{ ...latest, count: latest.count + 1 }, ...older];
  }
  return [entry, ...log].slice(0, LOG_SIZE);
}

/**
 * Listens on the document, capturing, so the page sees every key and pointer
 * event the browser delivers, even one another handler stops. Returns what
 * stops it.
 */
export function listenForInput(
  doc: Document,
  onEvent: (text: string, folds: boolean) => void,
): () => void {
  const handle = (event: Event) =>
    onEvent(describeEvent(event), FOLDED.has(event.type));
  const types = [...KEY_EVENTS, ...POINTER_EVENTS, "focusin"];
  for (const type of types) doc.addEventListener(type, handle, true);
  return () => {
    for (const type of types) doc.removeEventListener(type, handle, true);
  };
}
