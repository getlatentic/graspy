import { describe, expect, it } from "vitest";
import { SOUND_FILES, VOLUME } from "./sound-files";

type Bytes = { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

// Read from disk, as the browser tsconfig has no node types.
async function readSound(path: string): Promise<DataView> {
  const fsModule = "node:fs";
  const { readFileSync }: { readFileSync: (path: URL) => Bytes } = await import(
    /* @vite-ignore */ fsModule
  );
  const bytes = readFileSync(
    new URL(`../../../../public${path}`, import.meta.url),
  );
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The loudest sample of a 16-bit PCM WAV file, in dBFS. */
async function peakDb(path: string): Promise<number> {
  const wav = await readSound(path);
  let at = 12;
  while (wav.getUint32(at, false) !== 0x64617461) {
    at += 8 + wav.getUint32(at + 4, true);
  }
  const length = wav.getUint32(at + 4, true);
  let peak = 0;
  for (let i = at + 8; i < at + 8 + length; i += 2) {
    peak = Math.max(peak, Math.abs(wav.getInt16(i, true)));
  }
  return 20 * Math.log10(peak / 32768);
}

/** What reaches the speaker's amplifier: the file's peak under the playback level. */
const heard = async (file: string) =>
  (await peakDb(file)) + 20 * Math.log10(VOLUME);

describe("the cue sounds' level", () => {
  it("plays at full gain, the device's volume being the control", () => {
    expect(VOLUME).toBe(1);
  });

  it.each(["select", "press", "correct"] as const)(
    "puts the %s cue near -3 dBFS, where a TV's speaker can be heard (it was -18 and not heard)",
    async (cue) => {
      const level = await heard(SOUND_FILES[cue]);
      expect(level).toBeGreaterThanOrEqual(-4);
      expect(level).toBeLessThanOrEqual(-2);
    },
  );

  it("keeps the wrong answer the quietest cue, at least 5 dB under the others", async () => {
    const wrong = await heard(SOUND_FILES.wrong);
    for (const cue of ["select", "press", "correct"] as const) {
      expect(wrong).toBeLessThanOrEqual((await heard(SOUND_FILES[cue])) - 5);
    }
    expect(wrong).toBeGreaterThanOrEqual(-12);
  });

  it("leaves headroom under 0 dBFS, so nothing clips", async () => {
    for (const cue of ["select", "press", "correct", "wrong"] as const) {
      expect(await heard(SOUND_FILES[cue])).toBeLessThan(-1);
    }
  });
});
