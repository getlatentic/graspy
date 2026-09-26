import { describe, expect, it } from "vitest";
import { downsample, encodeWav, SAMPLE_RATE, toPcm16 } from "./wav";

const text = (view: DataView, at: number, length: number) =>
  String.fromCharCode(
    ...Array.from({ length }, (_, i) => view.getUint8(at + i)),
  );

describe("encodeWav", () => {
  const samples = Int16Array.from([0, 1000, -1000, 32767, -32768]);
  const view = new DataView(encodeWav(samples));

  it("writes a 44-byte RIFF WAVE header for mono 16-bit PCM at 16 kHz", () => {
    expect(view.byteLength).toBe(44 + samples.length * 2);
    expect(text(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(text(view, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(SAMPLE_RATE * 2);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("stores the samples little-endian after the header", () => {
    const stored = Array.from({ length: samples.length }, (_, i) =>
      view.getInt16(44 + i * 2, true),
    );
    expect(stored).toEqual(Array.from(samples));
  });
});

describe("toPcm16", () => {
  it("scales to the 16-bit range and clips what is louder", () => {
    expect(
      Array.from(toPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5]))),
    ).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });
});

describe("downsample", () => {
  it("brings 48 kHz to 16 kHz, averaging each three samples", () => {
    const out = downsample(Float32Array.from([0, 0.3, 0.6, 1, 1, 1]), 48_000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(1);
  });

  it("leaves 16 kHz as it is", () => {
    const same = Float32Array.from([0.1, 0.2]);
    expect(downsample(same, 16_000)).toBe(same);
  });
});
