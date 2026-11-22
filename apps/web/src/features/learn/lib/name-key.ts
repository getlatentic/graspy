/** Compared at this length, so a huge name costs the same as a long one. */
const MAX_NAME = 80;

/**
 * A subject's or course's name as it is compared: case, accents, spacing and punctuation do not
 * make another. Nothing else does, so "Maths" and "Mathematics" stay two names, as on the server.
 */
export function nameKey(name: string): string {
  return name
    .slice(0, MAX_NAME)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ");
}
