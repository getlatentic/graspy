import type { AgeBand } from "@/lib/age-band";

/** The scene for an age band; a still life for anyone whose age is not known yet. */
export function sceneUrl(band: AgeBand | null): string {
  if (band === "tween") return "/brand/art/scene-tween.webp";
  if (band === "teen") return "/brand/art/scene-desk.webp";
  return "/brand/art/scene-still-life.webp";
}
