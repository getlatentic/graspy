import type { LessonContextRequest } from "../domain/lessonPlanning";
import {
  granularLessonRecordSchema,
  type GranularLessonProgramInput,
  type GranularLessonRecord,
} from "../domain/granularLesson";

/**
 * Which lesson is being prepared, so a scope derived for it can be let go when
 * preparing it does not work out.
 */
export interface GranularLessonPreparationRequest {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly input: GranularLessonProgramInput;
}

/**
 * Told the handle this run is known by, so whoever is waiting can ask how far
 * it has got. The run is one long call that answers only at the end, so
 * without this the wait is unobservable.
 */
export type GranularLessonRequestStarted = (requestId: string) => void;

export interface GranularLessonCompletionGateway {
  createCompletion(
    request: GranularLessonPreparationRequest,
    signal: AbortSignal,
    onRequestStarted?: GranularLessonRequestStarted,
  ): Promise<unknown>;
}

export interface GranularLessonGenerator {
  prepare(
    request: GranularLessonPreparationRequest,
    signal: AbortSignal,
    onRequestStarted?: GranularLessonRequestStarted,
  ): Promise<GranularLessonRecord>;
}

export class GranularLessonCancelledError extends Error {
  constructor() {
    super("Preparing this lesson was stopped.");
    this.name = "GranularLessonCancelledError";
  }
}

export class GranularLessonValidationError extends Error {
  constructor() {
    super("The prepared lesson is incomplete. Prepare it again.");
    this.name = "GranularLessonValidationError";
  }
}

export class LocalGranularLessonGenerator implements GranularLessonGenerator {
  constructor(private readonly gateway: GranularLessonCompletionGateway) {}

  async prepare(
    request: GranularLessonPreparationRequest,
    signal: AbortSignal,
    onRequestStarted?: GranularLessonRequestStarted,
  ): Promise<GranularLessonRecord> {
    if (signal.aborted) throw new GranularLessonCancelledError();
    let completion: unknown;
    try {
      completion = await this.gateway.createCompletion(
        request,
        signal,
        onRequestStarted,
      );
    } catch (error) {
      if (signal.aborted || isAbortError(error) || wasStoppedByTheTaskBar(error)) {
        throw new GranularLessonCancelledError();
      }
      throw error;
    }
    if (signal.aborted) throw new GranularLessonCancelledError();
    const record = granularLessonRecordSchema.safeParse(completion);
    if (!record.success) throw new GranularLessonValidationError();
    return record.data;
  }
}

/**
 * What the backend says when work was stopped before it reached the engine.
 *
 * A teacher has two ways to stop a preparation: the button on the screen, which
 * aborts this request, and the one on the task bar, which cancels the task in
 * the backend and never touches this signal. Only the first was recognised as a
 * stop, so stopping from the bar was reported to the teacher as a failure. This
 * is the backend's word for the second, and it crosses the boundary as the
 * error text of a refused command.
 */
const STOPPED_BEFORE_STARTING = "This work was stopped before it started.";

function wasStoppedByTheTaskBar(error: unknown): boolean {
  return error instanceof Error && error.message.trim() === STOPPED_BEFORE_STARTING;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
