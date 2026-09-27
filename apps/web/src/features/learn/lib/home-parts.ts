export type HomePart =
  "continue" | "rail" | "voice" | "noVoice" | "subjects" | "try";

export interface HomeState {
  /** The server's word: the class learns by voice alone. */
  voiceOnly: boolean;
  /** The app has voice lessons for the class. */
  hasVoiceLessons: boolean;
  hasCurrent: boolean;
  subjectCount: number;
}

/** What Home shows, in order. A class that learns by voice alone has its voice lessons
 * and nothing to read, whatever subjects its plan holds; with no voice lessons for it
 * yet, Home says so rather than showing nothing. */
export function homeParts({
  voiceOnly,
  hasVoiceLessons,
  hasCurrent,
  subjectCount,
}: HomeState): HomePart[] {
  if (voiceOnly) return [hasVoiceLessons ? "voice" : "noVoice"];
  return [
    ...(hasCurrent ? (["continue"] as const) : []),
    "rail",
    "voice",
    ...(subjectCount > 0 ? (["subjects"] as const) : []),
    "try",
  ];
}
