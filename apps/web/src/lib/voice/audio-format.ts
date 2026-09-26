export type AudioFormat = "ogg" | "mp3";

/** Ogg Opus where the browser plays it; MP3 for one that cannot, such as an older Safari. */
export function audioFormatFor(
  canPlayType: (type: string) => string,
): AudioFormat {
  return canPlayType('audio/ogg; codecs="opus"') ? "ogg" : "mp3";
}

let chosen: AudioFormat | null = null;

export function audioFormat(): AudioFormat {
  if (chosen) return chosen;
  const probe = typeof Audio === "function" ? new Audio() : null;
  chosen = probe ? audioFormatFor((type) => probe.canPlayType(type)) : "ogg";
  return chosen;
}
