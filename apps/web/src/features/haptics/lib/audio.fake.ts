import { vi } from "vitest";

/** What a fake decode returns: the file it was made from, so a test can tell which recording played. */
export interface FakeBuffer {
  file: string;
}

interface FakeSource {
  buffer: FakeBuffer | null;
  onended: null | (() => void);
  connect: <T>(to: T) => T;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

/** The bytes a fake fetch answers: the file's own path, which the fake decode reads back. */
export function fakeFetch(options: { missing?: readonly string[] } = {}) {
  return vi.fn(async (url: string): Promise<ArrayBuffer> => {
    if (options.missing?.includes(url)) throw new Error(`${url}: 404`);
    return new TextEncoder().encode(url).buffer as ArrayBuffer;
  });
}

/** A stand-in AudioContext that records the recordings it decoded and the sources it played. */
export function fakeAudio(options: { undecodable?: boolean } = {}) {
  const sources: FakeSource[] = [];
  const masters: { gain: { value: number } }[] = [];
  const contexts: {
    state: string;
    resume: ReturnType<typeof vi.fn>;
    decodeAudioData: ReturnType<typeof vi.fn>;
  }[] = [];

  class FakeContext {
    state = "suspended";
    destination = {};
    // Like a browser, it wakes a moment after the gesture, not within it.
    resume = vi.fn(() =>
      Promise.resolve().then(() => {
        this.state = "running";
      }),
    );
    decodeAudioData = vi.fn(async (bytes: ArrayBuffer): Promise<FakeBuffer> => {
      if (options.undecodable) throw new Error("cannot decode");
      return { file: new TextDecoder().decode(bytes) };
    });
    constructor() {
      contexts.push(this);
    }
    createGain() {
      const master = {
        gain: { value: 1 },
        connect: <T>(to: T) => to,
        disconnect: vi.fn(),
      };
      masters.push(master);
      return master;
    }
    createBufferSource() {
      const source: FakeSource = {
        buffer: null,
        onended: null,
        connect: (to) => to,
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    }
  }

  return {
    Context: FakeContext as unknown as new () => AudioContext,
    sources,
    masters,
    contexts,
  };
}

/** Lets the fetches and decodes a gesture started finish. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
