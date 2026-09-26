import { sendKept, whenSettled } from "@/lib/voice/answer-outbox";
import { forgetAnswer } from "@/lib/voice/answer-store";
import type { LessonEvent } from "./lesson-state";

// A server that was busy may take it now; going online also sends it, without waiting for this.
const RETRY_MS = 20_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sees the answer on screen through: sent, shown as kept and tried again while the server cannot
 * take it, then marked or refused. Once its outcome is shown it leaves the device.
 */
export async function followAnswer(
  key: string,
  emit: (event: LessonEvent) => void,
  signal: AbortSignal,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<void> {
  const settled = whenSettled(key, signal);
  let now = await sendKept(key);
  if (signal.aborted) return;
  if (now?.kind === "kept") emit({ type: "kept", key });
  while (now?.kind === "kept") {
    const again = pause(RETRY_MS).then(() =>
      signal.aborted ? null : sendKept(key),
    );
    now = await Promise.race([settled, again]);
    if (signal.aborted) return;
  }
  const sent = now ?? (await settled);
  emit({ type: "settled", key, sent });
  await forgetAnswer(key);
}
