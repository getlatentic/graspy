import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childVoiceFilter, convert } from "./audio.ts";
import { cacheName, type Speaker } from "./child-voice.ts";

/** What made the child's recordings where the cloned voice is not used. */
export const SAY_ENGINE_NAME = "macOS say (system voice, not cloned)";

const SAMPLE_RATE = 22_050;

function say(voice: string, text: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("say", ["-v", voice, "--data-format=LEI16@22050", "-o", output, "--", text]);
    process.on("error", reject);
    process.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`say failed (${code}) for voice ${voice}`))));
  });
}

/** The simulated child spoken by a macOS system voice and pitched up, for a machine without the cloned voice's weights. */
export class SayVoice implements Speaker {
  private readonly voice: string;
  private readonly cache: string;

  constructor(voice: string, cache: string) {
    this.voice = voice;
    this.cache = cache;
    mkdirSync(cache, { recursive: true });
  }

  async speak(text: string, pitch: number, take: number): Promise<Buffer> {
    const file = join(this.cache, cacheName(text, pitch, this.voice, take));
    if (!existsSync(file)) {
      const raw = join(tmpdir(), `child-say-${process.pid}-${Date.now()}.wav`);
      await say(this.voice, text, raw);
      await convert(raw, file, childVoiceFilter(pitch, SAMPLE_RATE));
    }
    return readFileSync(file);
  }

  get reference(): string {
    return `${this.voice}.wav`;
  }

  close(): void {}
}
