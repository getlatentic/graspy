import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { childVoiceFilter, convert } from "./audio.ts";
import { JsonRpcProcess } from "./json-rpc.ts";

const ENGINE = "/Applications/yarngo studio.app/Contents/Resources/sidecar/engine.py";

interface Generated {
  output_path: string;
  sample_rate: number;
}

export interface VoiceLocation {
  data: string;
  python: string;
  reference: string;
}

/** Where yarngo studio keeps its runtime and the recorded voices it clones. */
export function locateYarngo(data = process.env.YARNGO_DATA ?? join(homedir(), "Library", "Application Support", "Yarngo Studio")): VoiceLocation {
  const runtimes = join(data, "runtimes", "mlx");
  if (!existsSync(runtimes)) throw new Error(`yarngo studio has no MLX runtime in ${runtimes}`);
  const latest = readdirSync(runtimes).sort().at(-1) as string;
  return {
    data,
    python: join(runtimes, latest, ".venv", "bin", "python3"),
    reference: join(data, "voices", "voice-1.wav"),
  };
}

export function cacheName(text: string, pitch: number, reference: string, take: number): string {
  return `${createHash("sha1").update(`${reference}|${pitch}|${take}|${text}`).digest("hex").slice(0, 16)}.wav`;
}

/** The simulated child's voice: yarngo studio's cloned voice, pitched up to sound like a smaller speaker. */
export class ChildVoice {
  private readonly where: VoiceLocation;
  private readonly cache: string;
  private readonly engine: JsonRpcProcess;

  constructor(where: VoiceLocation, cache: string) {
    this.where = where;
    this.cache = cache;
    mkdirSync(cache, { recursive: true });
    this.engine = new JsonRpcProcess(where.python, [ENGINE], {
      env: { ...process.env, YARNGO_DATA: where.data },
    });
  }

  /** The wav of the child saying the text, from the cache when this take of it was made before. */
  /** A new take of the same words is a new recording: a child never says a thing the same way twice. */
  async speak(text: string, pitch: number, take: number): Promise<Buffer> {
    const file = join(this.cache, cacheName(text, pitch, this.where.reference, take));
    if (!existsSync(file)) await this.synthesise(text, pitch, file);
    return readFileSync(file);
  }

  close(): void {
    this.engine.close();
  }

  private async synthesise(text: string, pitch: number, file: string): Promise<void> {
    const raw = join(tmpdir(), `child-${process.pid}-${Date.now()}.wav`);
    const made = await this.engine.call<Generated>("synthesis.generate", {
      text,
      reference_audio: this.where.reference,
      output_path: raw,
    });
    await convert(raw, file, childVoiceFilter(pitch, made.sample_rate));
  }
}
