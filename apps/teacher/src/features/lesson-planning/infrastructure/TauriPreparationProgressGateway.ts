import { invoke } from "@tauri-apps/api/core";

import {
  preparationProgressSchema,
  type PreparationStepProgress,
} from "../domain/preparationProgress";

export interface PreparationProgressGateway {
  progressFor(requestId: string): Promise<readonly PreparationStepProgress[]>;
}

interface NativeCommandClient {
  invoke(command: string, arguments_: Record<string, unknown>): Promise<unknown>;
}

const nativeCommandClient: NativeCommandClient = {
  invoke(command, arguments_) {
    return invoke(command, arguments_);
  },
};

export class TauriPreparationProgressGateway implements PreparationProgressGateway {
  constructor(private readonly nativeClient: NativeCommandClient = nativeCommandClient) {}

  async progressFor(requestId: string): Promise<readonly PreparationStepProgress[]> {
    const progress = await this.nativeClient.invoke(
      "get_lesson_preparation_progress",
      { requestId },
    );
    return preparationProgressSchema.parse(progress);
  }
}
