// Whether anyone is at the TV. A TV that goes on to link itself by itself must know a person is
// there: a QR code left on a projector or shared in a call, or a lobby TV photographed, would
// otherwise be linked to whoever typed its code, with nobody to say no. The TV's own input is the
// proof: the last key press, click, touch, wheel turn or real movement of a pointer it saw.
//
// Only what a person did counts. An event a script made (`isTrusted` false) does not, and a
// pointer that has not moved does not: a screen that re-renders each second makes the browser
// send `pointermove` under a cursor that is standing still. Presence is kept on the monotonic
// clock, so a change of the wall clock, backward or forward, cannot keep it or make it.

let last: number | null = null;

/** Pointer movement of at least this many pixels counts; less is a pointer standing still. */
export const MOVE_PX = 8;

/** Something a person just did. Called only from what they did: the handler of the key press,
 * click or touch that started or restarted the flow, and the listeners below. A boot, a redirect
 * or a restart by a timer is not that, and does not call it. */
export function noteInput(at: number = performance.now()): void {
  last = at;
}

/** Notes an event as input if a person made it. For the handlers of the controls that start or
 * restart the flow. */
export function noteUserInput(event: Pick<Event, "isTrusted">): void {
  if (event.isTrusted) noteInput();
}

/** How long ago the TV last saw input, in milliseconds on the monotonic clock; null if it has
 * not, or if the clock reads earlier than the input (which means it cannot be trusted). */
export function sinceInput(now: number = performance.now()): number | null {
  if (last === null) return null;
  const since = now - last;
  return since >= 0 ? since : null;
}

/** Forgets all input: a TV that has just started. For tests. */
export function forgetInput(): void {
  last = null;
}

const DISCRETE = ["keydown", "pointerdown", "touchstart", "wheel"] as const;

/**
 * Notes each key press, pointer press, touch, wheel turn and pointer movement of `MOVE_PX` or
 * more on the page until the returned function is called. `trusted` says whether a person made an
 * event; by default the browser's `isTrusted`.
 */
export function trackInput(
  root: Document = document,
  trusted: (event: Event) => boolean = (event) => event.isTrusted,
): () => void {
  let from: { x: number; y: number } | null = null;
  const discrete = (event: Event) => {
    if (trusted(event)) noteInput();
  };
  const moved = (event: Event) => {
    if (!trusted(event)) return;
    const { screenX: x, screenY: y } = event as PointerEvent;
    const before = from;
    // The reference moves only when it counts, so slow drift in small steps still adds up.
    if (before === null) {
      from = { x, y };
      return;
    }
    if (Math.max(Math.abs(x - before.x), Math.abs(y - before.y)) >= MOVE_PX) {
      from = { x, y };
      noteInput();
    }
  };
  for (const name of DISCRETE) {
    root.addEventListener(name, discrete, { capture: true, passive: true });
  }
  root.addEventListener("pointermove", moved, { capture: true, passive: true });
  return () => {
    for (const name of DISCRETE) {
      root.removeEventListener(name, discrete, { capture: true });
    }
    root.removeEventListener("pointermove", moved, { capture: true });
  };
}
