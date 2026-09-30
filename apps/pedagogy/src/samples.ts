import { createHash } from "node:crypto";
import type { Run, Turn } from "./turn-log.ts";
import { hearingFidelity } from "./words.ts";
import type { WavInfo } from "./wav-info.ts";

/**
 * One recording the simulated child played to the app, with everything known about it. Every
 * record says `synthetic`: these are cloned-voice recordings, not people, and must never be
 * mixed with a dataset of real speakers without that flag.
 */
export interface SampleRecord {
  sample_id: string;
  file_name: string;
  synthetic: true;
  intended_text: string;
  speaker: { engine: string; reference: string; pitch: number; persona: string };
  spoken_language: string;
  lesson_language: string;
  learner_class: string;
  plan_id: string | null;
  event_id: string | null;
  prompt_id: string | null;
  teacher_said: string;
  teacher_showed: string | null;
  recogniser: { provider: string; transcript: string; parsed_answer: number | null; latency_ms: number } | null;
  hearing_fidelity: number | null;
  decision: string | null;
  feedback: string | null;
  page_note: string | null;
  duration_seconds: number;
  sample_rate_hz: number;
  channels: number;
  sha1: string;
  run_id: string;
  turn: number;
  recorded_at: string;
}

export const sampleId = (run: Run, turn: Turn) => `${run.id}-t${String(turn.index).padStart(2, "0")}`;

/** The sample for a turn in which the child spoke, given the recording's bytes and format. */
export function sampleOf(run: Run, turn: Turn, wav: Buffer, info: WavInfo, file: string, spoken: string): SampleRecord | null {
  if (!turn.child?.said || !turn.answerAudio) return null;
  const marking = turn.marking;
  return {
    sample_id: sampleId(run, turn),
    file_name: file,
    synthetic: true,
    intended_text: turn.child.said,
    speaker: { ...run.voice, persona: run.persona },
    spoken_language: spoken,
    lesson_language: run.language,
    learner_class: run.learnerClass,
    plan_id: turn.move.planId,
    event_id: turn.move.eventId,
    prompt_id: turn.move.promptId,
    teacher_said: turn.move.says,
    teacher_showed: turn.move.shows,
    recogniser: marking
      ? { provider: marking.provider, transcript: marking.heard, parsed_answer: marking.parsedAnswer, latency_ms: marking.latencyMs }
      : null,
    hearing_fidelity: marking ? hearingFidelity(turn.child.said, marking.heard) : null,
    decision: marking?.decision ?? null,
    feedback: marking?.feedback ?? null,
    page_note: turn.pageNote,
    duration_seconds: Math.round(info.durationSeconds * 100) / 100,
    sample_rate_hz: info.sampleRateHz,
    channels: info.channels,
    sha1: createHash("sha1").update(wav).digest("hex"),
    run_id: run.id,
    turn: turn.index,
    recorded_at: run.startedAt,
  };
}
