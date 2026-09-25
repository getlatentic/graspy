import { invoke } from "@tauri-apps/api/core";

import type {
  GranularLessonCompletionGateway,
  GranularLessonPreparationRequest,
  GranularLessonRequestStarted,
} from "./LocalGranularLessonGenerator";

interface NativeCommandClient {
  invoke(command: string, arguments_: Record<string, unknown>): Promise<unknown>;
}

const nativeCommandClient: NativeCommandClient = {
  invoke(command, arguments_) {
    return invoke(command, arguments_);
  },
};

export class TauriGranularLessonCompletionGateway
  implements GranularLessonCompletionGateway
{
  constructor(
    private readonly nativeClient: NativeCommandClient = nativeCommandClient,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  createCompletion(
    request: GranularLessonPreparationRequest,
    signal: AbortSignal,
    onRequestStarted?: GranularLessonRequestStarted,
  ): Promise<unknown> {
    if (signal.aborted) return Promise.reject(createAbortError());
    const requestId = this.createRequestId();
    onRequestStarted?.(requestId);

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
          .invoke("cancel_lesson_preparation_completion", { requestId })
          .then(
            () => settle(() => reject(createAbortError())),
            () => settle(() => reject(createAbortError())),
          );
      };
      signal.addEventListener("abort", cancelCompletion, { once: true });

      void this.nativeClient
        .invoke("create_granular_lesson_completion", {
          requestId,
          request,
        })
        .then(
          (record) => settle(() => resolve(record)),
          (error: unknown) => settle(() => reject(error)),
        );
    });
  }
}

function createAbortError(): DOMException {
  return new DOMException("Preparing this lesson was stopped.", "AbortError");
}
