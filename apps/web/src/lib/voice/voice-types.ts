// The voice lesson wire, as apps/server/src/app/voice returns it.

/** en, yo and pcm: the languages the teacher speaks. */
export type LessonLanguage = "en" | "yo" | "pcm";

export type Localized = Partial<Record<LessonLanguage, string>>;

export interface LessonActivity {
  kind: string;
  prompt_id: string;
  items?: Array<{ id: string; spoken: string }>;
}

/** One lesson event the teacher chose, or a rest when nothing is due today. */
export interface LessonMove {
  kind: "event" | "rest";
  plan_id?: string;
  event_id?: string;
  event?: string;
  subject?: string;
  title?: Localized;
  say: string;
  say_text?: Localized;
  show?: Localized | null;
  activity?: LessonActivity | null;
  reason?: string;
}

export interface LessonSnapshot {
  move: LessonMove;
  revision: number;
  day: string;
}

export type Standing = "mastered" | "learnt" | "started" | "untouched";

export interface CatalogueLesson {
  plan_id: string;
  subject: string;
  topic: string;
  title: Localized;
  standing: Standing;
  days_correct: number;
  current: boolean;
}

export interface Catalogue {
  day: string;
  lessons: CatalogueLesson[];
}

/** What a recording answers; the server requires consent on every one. */
export interface SampleMetadata {
  speaker_id: string;
  language_pair: "yo-en" | "pcm-en";
  spoken_language: LessonLanguage;
  lesson_language: LessonLanguage;
  learner_class: string;
  task: string;
  topic: string;
  prompt_id: string;
  plan_id?: string;
  event_id?: string;
  device: "web";
  consent: { granted: true; scope: "voice_lesson" };
}

export interface CreatedSample {
  sample_id: string;
  state: "awaiting_audio" | "ready";
  upload_path: string | null;
}

export type Decision = "correct" | "try_again" | "not_understood";

export interface MarkedTurn {
  sample_id: string;
  state: "complete";
  transcript: string;
  parsed_answer?: number | null;
  decision: Decision;
  feedback: string;
  provider: string;
  latency_ms: number;
  spoken_language?: string;
}

/** The evaluation's answer: marked, or still being marked by another request. `retry_after_ms`
 * names how long until a failed marking is tried again. */
export type Evaluation =
  | MarkedTurn
  | { sample_id: string; state: "processing"; retry_after_ms?: number };
