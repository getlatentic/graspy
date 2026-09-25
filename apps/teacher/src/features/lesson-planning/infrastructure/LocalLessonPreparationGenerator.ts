import {
  generatedLessonPreparationSchema,
  preparedLessonSchema,
  type PastedLessonSource,
  type PreparedLesson,
} from "../domain/lessonPreparation";

export interface LessonPreparationCompletionRequest {
  readonly signatureId: "lesson-preparation.create";
  readonly input: PastedLessonSource;
}

export interface LessonPreparationCompletionGateway {
  createCompletion(
    request: LessonPreparationCompletionRequest,
    signal: AbortSignal,
  ): Promise<string>;
}

export interface LessonPreparationOptions {
  readonly signal: AbortSignal;
}

export interface LessonPreparationGenerator {
  prepare(
    source: PastedLessonSource,
    options: LessonPreparationOptions,
  ): Promise<PreparedLesson>;
}

export class LessonPreparationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonPreparationValidationError";
  }
}

export class LessonPreparationCancelledError extends Error {
  constructor() {
    super("Preparing this lesson was stopped.");
    this.name = "LessonPreparationCancelledError";
  }
}

export class LocalLessonPreparationGenerator implements LessonPreparationGenerator {
  constructor(private readonly gateway: LessonPreparationCompletionGateway) {}

  async prepare(
    source: PastedLessonSource,
    options: LessonPreparationOptions,
  ): Promise<PreparedLesson> {
    if (options.signal.aborted) throw new LessonPreparationCancelledError();

    let completion: string;
    try {
      completion = await this.gateway.createCompletion(
        buildPreparationRequest(source),
        options.signal,
      );
    } catch (error) {
      if (options.signal.aborted || isAbortError(error)) {
        throw new LessonPreparationCancelledError();
      }
      throw error;
    }

    if (options.signal.aborted) throw new LessonPreparationCancelledError();
    return parsePreparation(completion);
  }
}

function buildPreparationRequest(
  source: PastedLessonSource,
): LessonPreparationCompletionRequest {
  return {
    signatureId: "lesson-preparation.create",
    input: source,
  };
}

function parsePreparation(completion: string): PreparedLesson {
  let decoded: unknown;
  try {
    decoded = JSON.parse(completion);
  } catch {
    throw new LessonPreparationValidationError(
      "The prepared lesson could not be read. Try preparing it again.",
    );
  }

  const generated = generatedLessonPreparationSchema.safeParse(decoded);
  const parsed = generated.success
    ? preparedLessonSchema.safeParse({
        ...generated.data,
        subtopic: generated.data.subtopic.trim() || null,
        steps: generated.data.steps.map((step) => ({
          ...step,
          durationMinutes: step.durationMinutes || null,
        })),
      })
    : generated;
  if (!parsed.success) {
    throw new LessonPreparationValidationError(
      "The prepared lesson is incomplete. Try preparing it again.",
    );
  }
  return parsed.data;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
