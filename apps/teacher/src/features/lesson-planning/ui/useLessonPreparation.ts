import { useEffect, useMemo, useRef, useState } from "react";

import type {
  GranularLessonProgramInput,
} from "../domain/granularLesson";
import type { LessonContextRequest } from "../domain/lessonPlanning";
import type { LessonPreparationState } from "../domain/lessonPreparation";
export type { LessonPreparationState };
import type { PreparationProgressGateway } from "../infrastructure/TauriPreparationProgressGateway";
import { useScrolledToStartedWork } from "./useLessonArrival";
import {
  GranularLessonCancelledError,
  type GranularLessonGenerator,
} from "../infrastructure/LocalGranularLessonGenerator";

/** How often to ask how far a run has got, while a teacher is watching it. */
const PROGRESS_INTERVAL_MS = 700;

const IDLE: LessonPreparationState = { status: "idle" };

export function useLessonPreparation(
  generator: GranularLessonGenerator,
  context: LessonContextRequest,
  loadInput: (lessonId: string) => Promise<GranularLessonProgramInput>,
  onPrepared: (lessonId: string) => Promise<boolean>,
  progressGateway?: PreparationProgressGateway,
) {
  const [states, setStates] = useState<ReadonlyMap<string, LessonPreparationState>>(new Map());
  const controllers = useRef(new Map<string, AbortController>());
  const watches = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const settle = (lessonId: string, next: LessonPreparationState) => {
    setStates((current) => {
      const updated = new Map(current);
      if (next.status === "idle") updated.delete(lessonId);
      else updated.set(lessonId, next);
      return updated;
    });
  };

  const stopWatching = (lessonId: string) => {
    const timer = watches.current.get(lessonId);
    if (timer === undefined) return;
    clearInterval(timer);
    watches.current.delete(lessonId);
  };

  // Leaving this screen stops watching, never the work. A preparation runs in
  // the backend against records that outlive any screen, and cancelling is the
  // teacher's explicit act — the bar carries it wherever they go.
  useEffect(() => {
    const timers = watches.current;
    return () => {
      for (const timer of timers.values()) clearInterval(timer);
      timers.clear();
    };
  }, []);

  // The run is one long call that answers only at the end, so how far it has
  // got has to be asked for. A failed ask is not worth telling a teacher
  // about: the lesson is still being prepared, and the next ask is a moment
  // away.
  const watch = (requestId: string, lessonId: string) => {
    if (!progressGateway) return;
    stopWatching(lessonId);
    watches.current.set(
      lessonId,
      setInterval(() => {
        void progressGateway.progressFor(requestId).then(
          (progress) =>
            setStates((current) => {
              const existing = current.get(lessonId);
              if (existing?.status !== "preparing") return current;
              const updated = new Map(current);
              updated.set(lessonId, { ...existing, progress });
              return updated;
            }),
          () => undefined,
        );
      }, PROGRESS_INTERVAL_MS),
    );
  };

  const prepare = async (lessonId: string) => {
    if (controllers.current.has(lessonId)) return false;
    const controller = new AbortController();
    controllers.current.set(lessonId, controller);
    settle(lessonId, { status: "preparing", lessonId, progress: [] });
    try {
      const input = await loadInput(lessonId);
      const record = await generator.prepare(
        { context, lessonId, input },
        controller.signal,
        (requestId) => watch(requestId, lessonId),
      );
      // The backend persisted the record before returning it; showing the
      // saved lesson is all that is left to do here.
      void record;
      const shown = await onPrepared(lessonId);
      settle(
        lessonId,
        shown
          ? IDLE
          : {
              status: "failed",
              lessonId,
              message: "The prepared lesson could not be opened. Reload the lesson list.",
            },
      );
      return shown;
    } catch (error) {
      settle(
        lessonId,
        error instanceof GranularLessonCancelledError
          ? { status: "cancelled", lessonId }
          : { status: "failed", lessonId, message: errorMessage(error) },
      );
      return false;
    } finally {
      controllers.current.delete(lessonId);
      stopWatching(lessonId);
    }
  };

  const cancel = (lessonId: string) => {
    controllers.current.get(lessonId)?.abort();
  };

  const reset = (lessonId: string) => settle(lessonId, IDLE);
  const stateFor = (lessonId: string): LessonPreparationState => states.get(lessonId) ?? IDLE;

  /**
   * Which lessons are being written, as one value that changes only when the
   * answer does — so a screen can react to work starting without re-running on
   * every progress tick.
   */
  const preparing = useMemo(
    () =>
      [...states.entries()]
        .filter(([, state]) => state.status === "preparing")
        .map(([lessonId]) => lessonId)
        .sort()
        .join(","),
    [states],
  );

  return { stateFor, preparing, prepare, cancel, reset };
}

function errorMessage(error: unknown): string {
  const raw =
    typeof error === "string" && error.trim()
      ? error
      : error instanceof Error && error.message.trim()
        ? error.message
        : "";
  return teacherFacingFailure(raw);
}

/**
 * The runtime's failure text is written for the model's repair loop, and when
 * a run runs out of repairs it surfaces to the teacher unchanged. That text
 * uses field names like objectiveKnowledge and sequence numbers no teacher
 * ever sees. Recognise those shapes and hand back something the teacher can
 * act on; pass a plain sentence through untouched.
 */
export function teacherFacingFailure(raw: string): string {
  const looksInternal =
    /objectiveKnowledge|lessonObjectiveSequence|candidateSequence|knowledgeComponentSequences|supportingRecordSequences|selectionCatalog|schema|validation|invalidCandidate|json/i.test(
      raw,
    );
  if (!raw) {
    return "This lesson could not be prepared. Try preparing it again.";
  }
  if (looksInternal) {
    return "graspy could not complete this lesson on this attempt. Try preparing it again, or edit the learning goals and try once more.";
  }
  return raw;
}


/**
 * Preparation wired so a finishing run cannot take the screen from a teacher.
 *
 * A run outlives the screen that started it. Without this, a lesson finishing
 * while the teacher is reading another one would pull them off it — the record
 * is saved either way, and the task bar is how they come back to it when they
 * choose to.
 *
 * The lesson on screen is held in a ref because the answer must be the one at
 * the moment the run finishes, not the one captured when it started.
 */
export function usePreparationBesideTheScreen({
  generator,
  context,
  progressGateway,
  getProgramInput,
  load,
}: {
  readonly generator: Parameters<typeof useLessonPreparation>[0];
  readonly context: Parameters<typeof useLessonPreparation>[1];
  readonly progressGateway: Parameters<typeof useLessonPreparation>[4];
  readonly getProgramInput: (lessonId: string) => Promise<GranularLessonProgramInput>;
  readonly load: (lessonId: string) => Promise<boolean>;
}) {
  const onScreenLessonId = useRef<string | null>(null);
  const showPreparedLesson = (lessonId: string) =>
    onScreenLessonId.current === null || onScreenLessonId.current === lessonId
      ? load(lessonId)
      : Promise.resolve(true);
  const controller = useLessonPreparation(
    generator,
    context,
    getProgramInput,
    showPreparedLesson,
    progressGateway,
  );
  useScrolledToStartedWork(controller.preparing);
  return {
    ...controller,
    /** Told which lesson is on screen, so a run knows whether it may show itself. */
    watch: (lessonId: string | null) => {
      onScreenLessonId.current = lessonId;
    },
  };
}
