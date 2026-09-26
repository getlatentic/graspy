export type HomePart = "continue" | "rail" | "voice" | "subjects" | "try";

/** What Home shows, in order. A class that learns by voice alone has its voice lessons
 * and nothing to read, whatever subjects its plan holds. */
export function homeParts(
  voiceOnly: boolean,
  hasCurrent: boolean,
  subjectCount: number,
): HomePart[] {
  if (voiceOnly) return ["voice"];
  return [
    ...(hasCurrent ? (["continue"] as const) : []),
    "rail",
    "voice",
    ...(subjectCount > 0 ? (["subjects"] as const) : []),
    "try",
  ];
}
