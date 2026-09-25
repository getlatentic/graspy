import { invoke } from "@tauri-apps/api/core";

import type {
  LessonPreparationCompletionGateway,
  LessonPreparationCompletionRequest,
} from "./LocalLessonPreparationGenerator";

interface NativeCommandClient {
  invoke(command: string, arguments_: Record<string, unknown>): Promise<unknown>;
}

const tauriNativeCommandClient: NativeCommandClient = {
  invoke(command, arguments_) {
    return invoke(command, arguments_);
  },
};

export class TauriLessonPreparationCompletionGateway
  implements LessonPreparationCompletionGateway
{
  constructor(
    private readonly nativeClient: NativeCommandClient = tauriNativeCommandClient,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  createCompletion(
    request: LessonPreparationCompletionRequest,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) return Promise.reject(createAbortError());
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
          .invoke("cancel_lesson_preparation_completion", { requestId })
          .then(
            () => settle(() => reject(createAbortError())),
            () => settle(() => reject(createAbortError())),
          );
      };
      signal.addEventListener("abort", cancelCompletion, { once: true });

      void this.nativeClient
        .invoke("create_lesson_preparation_completion", { requestId, request })
        .then(
          (completion) => {
            if (typeof completion !== "string") {
              settle(() =>
                reject(
                  new Error("The local engine returned an invalid lesson preparation."),
                ),
              );
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
  return new DOMException("Preparing this lesson was stopped.", "AbortError");
}
