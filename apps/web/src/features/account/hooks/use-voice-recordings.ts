import { useCallback, useEffect, useState } from "react";
import {
  NOTICE_VERSION,
  type RetentionDays,
} from "@/lib/account/consent-notices";
import {
  deleteRecording,
  deleteRecordings,
  getVoice,
  keepRecordings,
  stopKeepingRecordings,
  untilDone,
  type VoiceOverview,
} from "@/lib/account/voice-recordings-api";

/** One learner's voice recordings as a parent sees them: whether they are kept, and the kept
 * ones. `voice` is null until they load. */
export function useVoiceRecordings(learner: string) {
  const [voice, setVoice] = useState<VoiceOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    getVoice(learner)
      .then(setVoice)
      .catch((error: unknown) => {
        console.warn("Loading the voice recordings failed:", error);
        setLoadFailed(true);
      });
  }, [learner]);

  useEffect(load, [load]);

  const attempt = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
      return true;
    } catch (error) {
      console.warn("Changing the voice recordings failed:", error);
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const more = useCallback(
    () =>
      attempt(async () => {
        if (voice?.nextBefore == null) return;
        const next = await getVoice(learner, voice.nextBefore);
        setVoice(
          (shown) =>
            shown && {
              ...next,
              recordings: [...shown.recordings, ...next.recordings],
            },
        );
      }),
    [attempt, learner, voice?.nextBefore],
  );

  /** Throws when the agreement does not hold, for the parent to be told why. */
  const keep = useCallback(
    async (days: RetentionDays, firebaseIdToken: string) => {
      const consent = await keepRecordings(
        learner,
        NOTICE_VERSION,
        days,
        firebaseIdToken,
      );
      setVoice((shown) => shown && { ...shown, consent });
    },
    [learner],
  );

  const stop = useCallback(
    (deleteKept: boolean) =>
      attempt(async () => {
        if (deleteKept) {
          await untilDone(() => stopKeepingRecordings(learner, true));
        } else {
          await stopKeepingRecordings(learner, false);
        }
        setVoice(
          (shown) =>
            shown && {
              consent: null,
              recordings: deleteKept ? [] : shown.recordings,
              nextBefore: deleteKept ? null : shown.nextBefore,
            },
        );
      }),
    [attempt, learner],
  );

  const remove = useCallback(
    (recording: string) =>
      attempt(async () => {
        await deleteRecording(learner, recording);
        setVoice(
          (shown) =>
            shown && {
              ...shown,
              recordings: shown.recordings.filter(
                (one) => one.id !== recording,
              ),
            },
        );
      }),
    [attempt, learner],
  );

  const removeAll = useCallback(
    () =>
      attempt(async () => {
        await untilDone(() => deleteRecordings(learner));
        setVoice(
          (shown) => shown && { ...shown, recordings: [], nextBefore: null },
        );
      }),
    [attempt, learner],
  );

  return {
    voice,
    loadFailed,
    busy,
    failed,
    load,
    more,
    keep,
    stop,
    remove,
    removeAll,
  };
}
