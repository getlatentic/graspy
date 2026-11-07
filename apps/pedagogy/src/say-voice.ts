import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childVoiceFilter, convert } from "./audio.ts";
import { cacheName, type Speaker } from "./child-voice.ts";

/** What made the child's recordings where the cloned voice is not used. */
export const SAY_ENGINE_NAME = "macOS say (system voice, not cloned)";

const SAMPLE_RATE = 22_050;

const SAY_TIMEOUT_MS = 30_000;

function say(voice: string, text: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const speaker = spawn("say", ["-v", voice, "--data-format=LEI16@22050", "-o", output, "--", text], { timeout: SAY_TIMEOUT_MS });
    let errors = "";
    speaker.stderr.on("data", (chunk) => (errors += chunk));
    speaker.on("error", reject);
    speaker.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`say failed (${code}) for voice ${voice}: ${errors.trim()}`))));
  });
}

/** `say` falls back to its default voice for a name it does not know and exits well, so the name is checked against the installed voices. */
function requireInstalled(voice: string): void {
  const listed = spawnSync("say", ["-v", "?"], { encoding: "utf8", timeout: SAY_TIMEOUT_MS });
  const names = (listed.stdout ?? "").split("\n").map((row) => row.replace(/\s+[a-z]{2}[_-][A-Za-z]{2,}\s+#.*$/, "").trim());
  if (!names.some((name) => name === voice || name.startsWith(`${voice} (`))) throw new Error(`the macOS voice "${voice}" is not installed; "say -v ?" lists the ones that are`);
}

/** The simulated child spoken by a macOS system voice and pitched up, for a machine without the cloned voice's weights. */
export class SayVoice implements Speaker {
  private readonly voice: string;
  private readonly cache: string;

  constructor(voice: string, cache: string) {
    requireInstalled(voice);
    this.voice = voice;
    this.cache = cache;
    mkdirSync(cache, { recursive: true });
  }

  async speak(text: string, pitch: number, take: number): Promise<Buffer> {
    if (text.trim() === "") throw new Error("nothing to say");
    const file = join(this.cache, cacheName(text, pitch, this.voice, take));
    if (!existsSync(file)) await this.synthesise(text, pitch, file);
    return readFileSync(file);
  }

  /** Written beside the cache entry and moved into place, so a run stopped part way leaves no half-made clip that is served as a take. */
  private async synthesise(text: string, pitch: number, file: string): Promise<void> {
    const unique = randomUUID();
    const raw = join(tmpdir(), `child-say-${unique}.wav`);
    const partial = `${file}.${unique}.tmp.wav`;
    try {
      await say(this.voice, text, raw);
      await convert(raw, partial, childVoiceFilter(pitch, SAMPLE_RATE));
      renameSync(partial, file);
    } finally {
      rmSync(raw, { force: true });
      rmSync(partial, { force: true });
    }
  }

  get reference(): string {
    return `${this.voice}.wav`;
  }

  close(): void {}
}
