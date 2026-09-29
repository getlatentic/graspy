import { useCallback, useEffect, useRef, useState } from "react";
import { refusalCode } from "@/lib/account/account-call";
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

/** Why the recordings did not load: `notFound` when the account holds no such learner, which
 * trying again does not change. */
export type LoadProblem = "failed" | "notFound";

interface Held {
  learner: string;
  voice: VoiceOverview;
}

/** One learner's voice recordings as a parent sees them: whether they are kept, and the kept
 * ones. `voice` is null until they load. What is held is for one learner: an answer that comes
 * after the parent has moved to another is dropped. */
export function useVoiceRecordings(learner: string) {
  const [held, setHeld] = useState<Held | null>(null);
  const [problem, setProblem] = useState<{
    learner: string;
    problem: LoadProblem;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = useRef(learner);

  const settle = useCallback(
    (voice: VoiceOverview) => {
      if (current.current === learner) setHeld({ learner, voice });
    },
    [learner],
  );

  const load = useCallback(() => {
    setProblem(null);
    getVoice(learner)
      .then(settle)
      .catch((error: unknown) => {
        console.warn("Loading the voice recordings failed:", error);
        if (current.current !== learner) return;
        setProblem({
          learner,
          problem:
            refusalCode(error) === "no_such_learner" ? "notFound" : "failed",
        });
      });
  }, [learner, settle]);

  useEffect(() => {
    current.current = learner;
    setFailed(false);
    load();
  }, [learner, load]);

  const change = useCallback(
    (update: (voice: VoiceOverview) => VoiceOverview) =>
      setHeld((shown) =>
        shown?.learner === learner
          ? { learner, voice: update(shown.voice) }
          : shown,
      ),
    [learner],
  );

  // A failure part way may have changed the server, so what is shown is asked for again.
  const attempt = useCallback(
    async (work: () => Promise<void>, refreshOnFailure = false) => {
      setBusy(true);
      setFailed(false);
      try {
        await work();
        return true;
      } catch (error) {
        console.warn("Changing the voice recordings failed:", error);
        setFailed(true);
        if (refreshOnFailure) {
          await getVoice(learner).then(settle, () => undefined);
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [learner, settle],
  );

  const voice = held?.learner === learner ? held.voice : null;
  const loadProblem = problem?.learner === learner ? problem.problem : null;

  const more = useCallback(
    () =>
      attempt(async () => {
        if (
          !voice ||
          voice.nextBefore === null ||
          voice.nextBeforeId === null
        ) {
          return;
        }
        const next = await getVoice(learner, {
          before: voice.nextBefore,
          beforeId: voice.nextBeforeId,
        });
        change((shown) => ({
          ...next,
          recordings: [...shown.recordings, ...next.recordings],
        }));
      }),
    [attempt, change, learner, voice],
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
      change((shown) => ({ ...shown, consent }));
    },
    [change, learner],
  );

  const stop = useCallback(
    (deleteKept: boolean) =>
      attempt(async () => {
        if (deleteKept) {
          await untilDone(() => stopKeepingRecordings(learner, true));
        } else {
          await stopKeepingRecordings(learner, false);
        }
        change((shown) => ({
          consent: null,
          recordings: deleteKept ? [] : shown.recordings,
          nextBefore: deleteKept ? null : shown.nextBefore,
          nextBeforeId: deleteKept ? null : shown.nextBeforeId,
        }));
      }, true),
    [attempt, change, learner],
  );

  const remove = useCallback(
    (recording: string) =>
      attempt(async () => {
        await deleteRecording(learner, recording);
        change((shown) => ({
          ...shown,
          recordings: shown.recordings.filter((one) => one.id !== recording),
        }));
      }),
    [attempt, change, learner],
  );

  const removeAll = useCallback(
    () =>
      attempt(async () => {
        await untilDone(() => deleteRecordings(learner));
        change((shown) => ({
          ...shown,
          recordings: [],
          nextBefore: null,
          nextBeforeId: null,
        }));
      }, true),
    [attempt, change, learner],
  );

  return {
    voice,
    loadProblem,
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
