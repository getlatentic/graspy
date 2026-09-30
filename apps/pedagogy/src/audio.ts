import { spawn } from "node:child_process";

/** A voice heard as a smaller speaker's, at a level the app counts as speech. */
export function childVoiceFilter(pitch: number, sampleRate: number): string {
  return [
    `asetrate=${Math.round(sampleRate * pitch)}`,
    "aresample=48000",
    `atempo=${(1 / pitch).toFixed(4)}`,
    "loudnorm=I=-20:TP=-2:LRA=7",
  ].join(",");
}

export function ffmpegArgs(input: string, output: string, filter: string): string[] {
  return ["-y", "-loglevel", "error", "-i", input, "-af", filter, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", output];
}

export function convert(input: string, output: string, filter: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ffmpegArgs(input, output, filter));
    let errors = "";
    ffmpeg.stderr.on("data", (chunk) => (errors += chunk));
    ffmpeg.on("error", reject);
    ffmpeg.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${errors.trim()}`)),
    );
  });
}
