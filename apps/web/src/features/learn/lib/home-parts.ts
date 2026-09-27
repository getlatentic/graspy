export type HomePart =
  "continue" | "rail" | "voice" | "lessons" | "subjects" | "try";

/** What Home shows, in order. For a class that learns by voice alone Home is its voice
 * lessons, with nothing to read, whatever subjects its plan holds; any other class reaches
 * them from a card. */
export function homeParts(
  voiceOnly: boolean,
  hasCurrent: boolean,
  subjectCount: number,
): HomePart[] {
  if (voiceOnly) return ["lessons"];
  return [
    ...(hasCurrent ? (["continue"] as const) : []),
    "rail",
    "voice",
    ...(subjectCount > 0 ? (["subjects"] as const) : []),
    "try",
  ];
}
