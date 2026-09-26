import {
  sendKept,
  sendKeptAnswers,
  whenSettled,
} from "@/lib/voice/answer-outbox";
import { forgetAnswer, passOver, settledOf } from "@/lib/voice/answer-store";
import { UNANSWERED, type Sent } from "@/lib/voice/send-answer";
import { inTime, wait } from "./in-time";
import type { LessonEvent } from "./lesson-state";

// A server that was busy may take it now. Going online sends kept answers too, without
// waiting for this.
const RETRY_MS = 20_000;

/**
 * The answer as it stands: sent now, its outcome from the device, or null once it has left the
 * device. A device that could not be read or written keeps it on screen for the next try.
 */
async function answerNow(key: string): Promise<Sent | null> {
  try {
    return (await sendKept(key)) ?? (await settledOf(key));
  } catch (error) {
    console.warn("Following a kept answer failed; it is tried again:", error);
    return UNANSWERED;
  }
}

/**
 * Sees the answer on screen through: sent, shown as kept and tried again while the server cannot
 * take it, then marked or refused. Once its outcome is shown it leaves the device. Another tab may
 * see it through first: its outcome is then read from the device, and once that tab has let it go
 * the lesson moves on.
 */
export async function followAnswer(
  key: string,
  emit: (event: LessonEvent) => void,
  signal: AbortSignal,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<void> {
  const settled = whenSettled(key, signal);
  // A first try that hangs shows the answer kept, and the way on, when the retry comes due.
  let now = await Promise.race([
    answerNow(key),
    pause(RETRY_MS).then((): Sent => UNANSWERED),
  ]);
  if (signal.aborted) return;
  if (now?.kind === "kept") emit({ type: "kept", key, code: now.code });
  while (now?.kind === "kept") {
    const again = pause(RETRY_MS).then(() =>
      signal.aborted ? null : answerNow(key),
    );
    now = await Promise.race([settled, again]);
    if (signal.aborted) return;
  }
  if (!now) {
    emit({ type: "seenElsewhere", key });
    return;
  }
  emit({ type: "settled", key, sent: now });
  await forgetAnswer(key);
}

/**
 * Carries on past an answer that stays kept: it is still sent, but never shown, and the lesson
 * asks the teacher for her step, which may be its question again. Once the retry is due the
 * learner's kept answers go again, as the lesson no longer tries this one.
 */
export async function carryOn(
  key: string,
  learner: string,
  emit: (event: LessonEvent) => void,
  pause?: (ms: number) => Promise<unknown>,
  due: () => Promise<unknown> = () => wait(RETRY_MS),
): Promise<void> {
  // Storage that never answers still lets the child on; the answer may then be shown at the next Start.
  try {
    await inTime(passOver(key), pause);
  } catch (error) {
    console.warn("Passing over a kept answer failed:", error);
  }
  emit({ type: "carriedOn", key });
  void due()
    .then(() => sendKeptAnswers(learner))
    .catch(() => undefined);
}
