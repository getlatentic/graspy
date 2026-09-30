/** What one round of a lesson looked like from the child's side and the teacher's. */
export type Decision = "correct" | "try_again" | "not_understood";

export interface TeacherMove {
  kind: "event" | "rest";
  planId: string | null;
  eventId: string | null;
  /** The prompt the teacher asks, when it asks for an answer. */
  promptId: string | null;
  /** The Gagné event: gain_attention, present_content, elicit_performance ... */
  event: string | null;
  says: string;
  shows: string | null;
  asksForAnswer: boolean;
  reason: string | null;
  /** When the app was told about this step, on the clock the audio log uses. */
  offeredAt?: number;
}

export interface ChildTurn {
  /** The words the simulated child meant to say; null when it stayed silent. */
  said: string | null;
  /** Whether the child's own answer was right, when the persona knows. */
  isRight: boolean | null;
  note: string;
}

export interface Marking {
  heard: string;
  parsedAnswer: number | null;
  decision: Decision;
  feedback: string;
  provider: string;
  latencyMs: number;
  /** When the app was told the answer was marked. */
  at?: number;
}

export interface Turn {
  index: number;
  move: TeacherMove;
  child: ChildTurn | null;
  /** The child's recording, relative to the run's folder; null when the child said nothing. */
  answerAudio: string | null;
  /** Null when nothing was sent to be marked: the line taught, or the child was silent. */
  marking: Marking | null;
  /** Milliseconds from the child finishing speaking to the page showing an outcome; null with no answer. */
  replyWaitMs: number | null;
  /** What the page told the child under the lesson, such as "I couldn't hear you". */
  pageNote: string | null;
  screenshots: string[];
  /** When the child's turn was opened, so it can be told whether the teacher was still speaking. */
  recordedAt?: number;
}

/** How the child's recordings were made: they are synthetic, and any dataset built from them must say so. */
export interface ChildVoiceInfo {
  engine: string;
  reference: string;
  pitch: number;
}

export interface Run {
  id: string;
  voice: ChildVoiceInfo;
  persona: string;
  language: string;
  learnerClass: string;
  plan: string | null;
  startedAt: string;
  finished: "rest" | "turn-limit" | "stalled";
  turns: Turn[];
  /** What the page's audio elements did during the lesson. */
  audio?: import("./audio-probe.ts").AudioEvent[];
}
