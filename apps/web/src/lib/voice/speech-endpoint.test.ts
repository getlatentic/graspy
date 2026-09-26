import { describe, expect, it } from "vitest";
import { loudness, rms, SpeechEndpoint } from "./speech-endpoint";

const LOUD = 0.8;
const QUIET = 0.1;

function run(levels: number[]) {
  const endpoint = new SpeechEndpoint();
  return levels.map((level) => endpoint.add(level));
}

const repeat = (level: number, times: number) =>
  Array.from({ length: times }, () => level);

describe("SpeechEndpoint", () => {
  it("starts on three loud tenths and ends on 1.2 seconds of quiet", () => {
    const states = run([...repeat(LOUD, 3), ...repeat(QUIET, 12)]);
    expect(states[1]).toBe("waiting");
    expect(states[2]).toBe("speaking");
    expect(states[13]).toBe("speaking");
    expect(states[14]).toBe("finished");
  });

  it("takes a cough for nothing and a breath for part of the answer", () => {
    const states = run([
      ...repeat(LOUD, 2),
      QUIET,
      ...repeat(LOUD, 3),
      ...repeat(QUIET, 11),
      LOUD,
      ...repeat(QUIET, 11),
    ]);
    expect(states[2]).toBe("waiting");
    expect(states[5]).toBe("speaking");
    expect(states.at(-1)).toBe("speaking");
  });

  it("gives up after eight seconds in which nobody speaks", () => {
    const states = run(repeat(QUIET, 80));
    expect(states[78]).toBe("waiting");
    expect(states[79]).toBe("nothing");
  });
});

describe("loudness", () => {
  it("puts silence at 0, a full-scale voice at 1, and -35 dBFS near the speech line", () => {
    expect(loudness(0)).toBe(0);
    expect(loudness(32767)).toBe(1);
    expect(loudness(32767 * 10 ** (-35 / 20))).toBeCloseTo(0.41, 2);
  });

  it("measures a window's root mean square", () => {
    expect(rms(Int16Array.from([3, -4, 3, -4]))).toBeCloseTo(Math.sqrt(12.5));
    expect(rms(new Int16Array(0))).toBe(0);
  });
});
