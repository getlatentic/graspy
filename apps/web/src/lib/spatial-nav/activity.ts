/**
 * Whether this visit has used a pointer, a wheel or a touch screen. A person
 * reading with a mouse keeps the arrows for scrolling; a session driven by a
 * remote's pad alone has no other way to start, so its first arrow focuses a
 * control. The element last pointed at tells which scroll area is being read.
 */
let pointerSeen = false;
let pointed: Element | null = null;

const EVENTS = [
  "pointerdown",
  "pointermove",
  "wheel",
  "touchstart",
  "mousedown",
];

export function pointerWasUsed(): boolean {
  return pointerSeen;
}

export function lastPointed(): Element | null {
  return pointed;
}

export function resetActivity(): void {
  pointerSeen = false;
  pointed = null;
}

export function trackActivity(doc: Document): () => void {
  const note = (event: Event) => {
    pointerSeen = true;
    if (event.target instanceof Element) pointed = event.target;
  };
  for (const type of EVENTS) {
    doc.addEventListener(type, note, { capture: true, passive: true });
  }
  return () => {
    for (const type of EVENTS) doc.removeEventListener(type, note, true);
  };
}
