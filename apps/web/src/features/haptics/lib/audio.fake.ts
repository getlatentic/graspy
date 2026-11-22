import { vi } from "vitest";

/** A stand-in AudioContext that records the notes it was asked to play. */
export function fakeAudio() {
  const oscillators: ReturnType<typeof oscillator>[] = [];
  const gains: ReturnType<typeof gain>[] = [];
  const contexts: { state: string; resume: ReturnType<typeof vi.fn> }[] = [];

  function oscillator() {
    const note: {
      frequency: { value: number };
      onended: null | (() => void);
      connect: <T>(to: T) => T;
      disconnect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    } = {
      frequency: { value: 0 },
      onended: null,
      connect: (to) => to,
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    return note;
  }
  function gain() {
    return {
      gain: {
        peak: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime(this: { peak: number }, value: number) {
          this.peak = value;
        },
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: <T>(to: T) => to,
      disconnect: vi.fn(),
    };
  }

  class FakeContext {
    state = "suspended";
    currentTime = 10;
    destination = {};
    // Like a browser, it wakes a moment after the gesture, not within it.
    resume = vi.fn(() =>
      Promise.resolve().then(() => {
        this.state = "running";
      }),
    );
    constructor() {
      contexts.push(this);
    }
    createOscillator() {
      const note = oscillator();
      oscillators.push(note);
      return note;
    }
    createGain() {
      const level = gain();
      gains.push(level);
      return level;
    }
  }

  return {
    Context: FakeContext as unknown as new () => AudioContext,
    oscillators,
    gains,
    contexts,
  };
}
