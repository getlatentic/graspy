import { describe, expect, it } from "vitest";
import { childVoiceFilter, ffmpegArgs } from "./audio.ts";

describe("childVoiceFilter", () => {
  it("raises the pitch and restores the speed", () => {
    expect(childVoiceFilter(1.25, 48000)).toBe(
      "asetrate=60000,aresample=48000,atempo=0.8000,loudnorm=I=-20:TP=-2:LRA=7",
    );
  });
});

describe("ffmpegArgs", () => {
  it("writes mono 48 kHz 16-bit wav", () => {
    const args = ffmpegArgs("in.wav", "out.wav", "volume=1");
    expect(args.slice(-7)).toEqual(["-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", "out.wav"]);
    expect(args).toContain("volume=1");
  });
});
