import { invoke } from "@tauri-apps/api/core";

import type { LessonModelGateway } from "../application/LessonModelGateway";
import type { LessonModelChoice } from "../domain/lessonModel";

export class TauriLessonModelGateway implements LessonModelGateway {
  listModels(): Promise<readonly LessonModelChoice[]> {
    return invoke("list_lesson_models");
  }

  chooseModel(modelId: string): Promise<void> {
    return invoke("choose_lesson_model", { modelId });
  }
}
