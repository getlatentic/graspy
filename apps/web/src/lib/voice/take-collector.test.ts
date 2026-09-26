import { describe, expect, it } from "vitest";
import type { EndpointState } from "./speech-endpoint";
import { TakeCollector } from "./take-collector";

const RATE = 48_000;
const TENTH = RATE / 10;

// A tone loud enough to count as a voice, or a room's hush.
const tenths = (count: number, amplitude: number) =>
  Float32Array.from(
    { length: count * TENTH },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE),
  );

function collect(...parts: Float32Array[]) {
  const states: EndpointState[] = [];
  const take = new TakeCollector(RATE, (_level, state) => states.push(state));
  for (const part of parts) {
    // The worklet hands over 2048 samples at a time, across tenth boundaries.
    for (let at = 0; at < part.length; at += 2048)
      take.add(part.subarray(at, at + 2048));
  }
  return { take, states };
}

describe("TakeCollector", () => {
  it("keeps 16 kHz PCM, a tenth of a second at a time", async () => {
    const { take } = collect(tenths(10, 0.5));
    const wav = take.wav();
    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(44 + 10 * 1600 * 2);
  });

  it("finds the end of an answer after 1.2 seconds of quiet", () => {
    const { states, take } = collect(tenths(5, 0.5), tenths(12, 0.0001));
    expect(states.indexOf("speaking")).toBe(2);
    expect(states.indexOf("finished")).toBe(16);
    expect(take.audible).toBe(true);
  });

  it("knows a take nobody spoke in", () => {
    const { states, take } = collect(tenths(80, 0.0001));
    expect(states.at(-1)).toBe("nothing");
    expect(take.audible).toBe(false);
  });
});
