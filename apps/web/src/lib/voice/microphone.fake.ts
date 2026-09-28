// For tests: the browser's microphone and audio graph as startTake meets them, in a jsdom page.
import { vi } from "vitest";

const RATE = 48_000;
const TENTH = RATE / 10;

// A tone loud enough to count as a voice.
const voice = (tenths: number) =>
  Float32Array.from(
    { length: tenths * TENTH },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE),
  );

type Listener = ((event: MessageEvent<Float32Array>) => void) | null;

/** A fresh microphone for each call, replacing the last; the audio globals are undone by vi.unstubAllGlobals. */
export function fakeMicrophone() {
  const track = { stop: vi.fn() };
  const ports: { onmessage: Listener }[] = [];
  const closed = vi.fn(async () => undefined);
  let allow = () => {};
  let asking = false;

  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = RATE;
      audioWorklet = { addModule: async () => undefined };
      createMediaStreamSource = () => ({ connect: () => undefined });
      close = closed;
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { onmessage: null as Listener };
      constructor() {
        ports.push(this.port);
      }
    },
  );
  const stream = { getTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () =>
        asking
          ? new Promise((resolve) => (allow = () => resolve(stream)))
          : Promise.resolve(stream),
    },
  });

  return {
    /** Stopped once the microphone is released: the browser's indicator goes off. */
    track,
    closed,
    /** The browser's prompt stays up until [allow] is called. */
    ask: () => {
      asking = true;
      return () => allow();
    },
    speak: (tenths: number) =>
      ports.at(-1)?.onmessage?.({ data: voice(tenths) } as MessageEvent),
  };
}

/** The tab hidden or shown, as the browser announces it. */
export function showPage(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
