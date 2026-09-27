export type HomePart =
  "continue" | "rail" | "voice" | "lessons" | "noVoice" | "subjects" | "try";

export interface HomeState {
  /** The server's word: the class learns by voice alone. */
  voiceOnly: boolean;
  /** The app has voice lessons for the class. */
  hasVoiceLessons: boolean;
  hasCurrent: boolean;
  subjectCount: number;
}

/** What Home shows, in order. For a class that learns by voice alone Home is its voice
 * lessons, with nothing to read, whatever subjects its plan holds; with no voice lessons
 * in the app for it yet, Home says so rather than showing nothing. Any other class reaches
 * them from a card. */
export function homeParts({
  voiceOnly,
  hasVoiceLessons,
  hasCurrent,
  subjectCount,
}: HomeState): HomePart[] {
  if (voiceOnly) return [hasVoiceLessons ? "lessons" : "noVoice"];
  return [
    ...(hasCurrent ? (["continue"] as const) : []),
    "rail",
    "voice",
    ...(subjectCount > 0 ? (["subjects"] as const) : []),
    "try",
  ];
}
