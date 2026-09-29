import { describe, expect, it } from "vitest";
import { wavInfo } from "./wav-info.ts";

function wav(seconds: number, extra: Buffer = Buffer.alloc(0)): Buffer {
  const data = Buffer.alloc(48_000 * 2 * seconds);
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(48_000, 12);
  fmt.writeUInt32LE(96_000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0);
  head.write("WAVE", 8);
  const dataHead = Buffer.alloc(8);
  dataHead.write("data", 0);
  dataHead.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, fmt, extra, dataHead, data]);
}

describe("wavInfo", () => {
  it("reads the format and the length", () => {
    expect(wavInfo(wav(3))).toEqual({ sampleRateHz: 48_000, channels: 1, bitsPerSample: 16, durationSeconds: 3 });
  });

  it("steps over a chunk it does not need", () => {
    const list = Buffer.alloc(8 + 10);
    list.write("LIST", 0);
    list.writeUInt32LE(10, 4);
    expect(wavInfo(wav(1, list)).durationSeconds).toBe(1);
  });

  it("refuses what is not a wav", () => {
    expect(() => wavInfo(Buffer.from("nope nope nope nope"))).toThrow(/Not a wav/);
  });
});
