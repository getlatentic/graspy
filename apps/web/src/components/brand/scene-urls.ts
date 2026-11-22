import type { AgeBand } from "@/lib/age-band";

export interface SceneImage {
  src: string;
  width: number;
  height: number;
}

const KIDS: SceneImage = {
  src: "/brand/art/hero-kids.webp",
  width: 1200,
  height: 751,
};
const TWEEN: SceneImage = {
  src: "/brand/art/scene-tween.webp",
  width: 900,
  height: 1125,
};
const DESK: SceneImage = {
  src: "/brand/art/scene-desk.webp",
  width: 900,
  height: 1125,
};
const STILL_LIFE: SceneImage = {
  src: "/brand/art/scene-still-life.webp",
  width: 900,
  height: 1125,
};

/** The scene for an age band; a still life for anyone whose age is not known yet. */
export function sceneImage(band: AgeBand | null): SceneImage {
  if (band === "child") return KIDS;
  if (band === "tween") return TWEEN;
  if (band === "teen") return DESK;
  return STILL_LIFE;
}
