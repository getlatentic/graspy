import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SayVoice } from "./say-voice.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe.skipIf(process.platform !== "darwin")("SayVoice", () => {
  it("speaks the text as a 48 kHz mono wav and reuses a take it made", async () => {
    const cache = mkdtempSync(join(tmpdir(), "say-voice-"));
    dirs.push(cache);
    const voice = new SayVoice("Samantha", cache);
    const wav = await voice.speak("forty two", 1.2, 0);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.length).toBeGreaterThan(20_000);
    const file = join(cache, readdirSync(cache)[0]);
    const made = statSync(file).mtimeMs;
    await voice.speak("forty two", 1.2, 0);
    expect(statSync(file).mtimeMs).toBe(made);
    expect((await voice.speak("forty two", 1.2, 1)).length).toBeGreaterThan(0);
  }, 60_000);

  it("names a voice that is not installed instead of speaking in another", () => {
    const cache = mkdtempSync(join(tmpdir(), "say-voice-"));
    dirs.push(cache);
    expect(() => new SayVoice("No Such Voice", cache)).toThrow(/No Such Voice/);
  });

  it("refuses to say nothing", async () => {
    const cache = mkdtempSync(join(tmpdir(), "say-voice-"));
    dirs.push(cache);
    await expect(new SayVoice("Samantha", cache).speak("  ", 1.2, 0)).rejects.toThrow("nothing to say");
  });
});
