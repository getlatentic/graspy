// Whether anyone is at the TV. A TV that goes on to link itself by itself must know a person is
// there: a QR code left on a projector or shared in a call, or a lobby TV photographed, would
// otherwise be linked to whoever typed its code, with nobody to say no. The TV's own input is the
// proof: the last key, pointer or touch it saw.

let last: number | null = null;

/** Something just happened at the TV, or the person here just pressed what opened this screen. */
export function noteInput(at: number = Date.now()): void {
  last = at;
}

/** When the TV last saw input, in milliseconds since the epoch; null if it has not. */
export function lastInputAt(): number | null {
  return last;
}

const EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "touchstart",
  "wheel",
] as const;

/** Notes each key, pointer and touch event on the page until the returned function is called. */
export function trackInput(root: Document = document): () => void {
  const note = () => noteInput();
  for (const name of EVENTS) {
    root.addEventListener(name, note, { capture: true, passive: true });
  }
  return () => {
    for (const name of EVENTS) {
      root.removeEventListener(name, note, { capture: true });
    }
  };
}
