import { invoke } from "@tauri-apps/api/core";

import type {
  LessonNoteCompletionGateway,
  LessonNoteCompletionRequest,
} from "./LocalLessonNoteGenerator";

export interface NativeCommandClient {
  invoke(command: string, arguments_: Record<string, unknown>): Promise<unknown>;
}

const tauriNativeCommandClient: NativeCommandClient = {
  invoke(command, arguments_) {
    return invoke(command, arguments_);
  },
};

/**
 * Runs a student-note completion on the local engine, cancelling the in-flight
 * request if the teacher stops before it lands.
 */
export class TauriLessonNoteCompletionGateway implements LessonNoteCompletionGateway {
  constructor(
    private readonly nativeClient: NativeCommandClient = tauriNativeCommandClient,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  createCompletion(request: LessonNoteCompletionRequest, signal: AbortSignal): Promise<string> {
    if (signal.aborted) {
      return Promise.reject(createAbortError());
    }

    const requestId = this.createRequestId();

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", cancelCompletion);
        action();
      };

      const cancelCompletion = () => {
        void this.nativeClient
          .invoke("cancel_lesson_note_completion", { requestId })
          .then(
            () => settle(() => reject(createAbortError())),
            () => settle(() => reject(createAbortError())),
          );
      };

      signal.addEventListener("abort", cancelCompletion, { once: true });

      void this.nativeClient.invoke("create_lesson_note_completion", { requestId, task: request.task, request: { signatureId: request.signatureId, input: request.input } }).then(
        (completion) => {
          if (typeof completion !== "string") {
            settle(() => reject(new Error("The local engine returned an invalid completion payload.")));
            return;
          }
          settle(() => resolve(completion));
        },
        (error: unknown) => settle(() => reject(error)),
      );
    });
  }
}

function createAbortError(): DOMException {
  return new DOMException("Writing the student note was stopped.", "AbortError");
}
