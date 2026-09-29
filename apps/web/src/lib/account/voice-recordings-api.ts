import { toApiError, toNetworkError } from "@/lib/api/errors";
import { fetchWithSession } from "@/lib/api/session";
import { ACCOUNT_URL, call } from "./account-call";
import type { RetentionDays } from "./consent-notices";
import type { VoiceConsent } from "./learners-api";

// What a parent may do with a learner's voice recordings (app/api/account_voice_routes.py).

export interface RecordingsConsent extends VoiceConsent {
  grantedAt: number;
}

/** A kept recording; the times are milliseconds since the epoch. */
export interface Recording {
  id: string;
  recordedAt: number;
  expiresAt: number;
  /** The lesson's title. */
  lesson: string | null;
  transcript: string | null;
  /** Null for anything but the apps' own WAV. */
  durationSeconds: number | null;
  bytes: number;
}

export interface VoiceOverview {
  consent: RecordingsConsent | null;
  recordings: Recording[];
  /** The `before` of the next page; null on the last. */
  nextBefore: number | null;
}

/** What one call deleted; while `more`, the rest is deleted by asking again. */
export interface Deleted {
  deleted: number;
  more: boolean;
}

const voiceUrl = (learner: string) =>
  `${ACCOUNT_URL}/learners/${learner}/voice`;

export function getVoice(
  learner: string,
  before?: number,
): Promise<VoiceOverview> {
  const query = before === undefined ? "" : `?before=${before}`;
  return call(`${voiceUrl(learner)}${query}`, "GET");
}

export function keepRecordings(
  learner: string,
  noticeVersion: number,
  retentionDays: RetentionDays,
  firebaseIdToken: string,
): Promise<RecordingsConsent> {
  return call(`${voiceUrl(learner)}/consent`, "PUT", {
    noticeVersion,
    retentionDays,
    firebaseIdToken,
  });
}

/** Stops keeping recordings; those already kept stay until they expire, unless `deleteKept`. */
export function stopKeepingRecordings(
  learner: string,
  deleteKept: boolean,
): Promise<Deleted> {
  const query = deleteKept ? "?deleteRecordings=true" : "";
  return call(`${voiceUrl(learner)}/consent${query}`, "DELETE");
}

export function deleteRecording(
  learner: string,
  recording: string,
): Promise<void> {
  return call(`${voiceUrl(learner)}/recordings/${recording}`, "DELETE");
}

export function deleteRecordings(learner: string): Promise<Deleted> {
  return call(`${voiceUrl(learner)}/recordings`, "DELETE");
}

/** Asks again while the server says there is more to delete, and returns how many went. A
 * call that deleted nothing yet says there is more would go on for ever: that is a failure. */
export async function untilDone(step: () => Promise<Deleted>): Promise<number> {
  let total = 0;
  for (;;) {
    const { deleted, more } = await step();
    total += deleted;
    if (!more) return total;
    if (deleted === 0) throw new Error("Deleting made no progress");
  }
}

/** The recording itself; its object URL is the caller's to revoke. */
export async function recordingAudio(
  learner: string,
  recording: string,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetchWithSession(
      `${voiceUrl(learner)}/recordings/${recording}/audio`,
    );
    if (response.ok) return await response.blob();
  } catch (cause) {
    throw toNetworkError(cause);
  }
  throw await toApiError(response);
}
