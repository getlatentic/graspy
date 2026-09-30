export interface WavInfo {
  sampleRateHz: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
}

/** The format and length of a PCM wav, read from its chunks so extra chunks (LIST) do not matter. */
export function wavInfo(wav: Buffer): WavInfo {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a wav file");
  let format: Omit<WavInfo, "durationSeconds"> | null = null;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt ") {
      format = { channels: wav.readUInt16LE(at + 10), sampleRateHz: wav.readUInt32LE(at + 12), bitsPerSample: wav.readUInt16LE(at + 22) };
    } else if (id === "data" && format) {
      const bytes = Math.min(size, wav.length - at - 8);
      const frame = format.channels * (format.bitsPerSample / 8);
      return { ...format, durationSeconds: bytes / frame / format.sampleRateHz };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("The wav has no fmt and data chunks");
}
