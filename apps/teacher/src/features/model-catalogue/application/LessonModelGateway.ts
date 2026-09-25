import type { LessonModelChoice } from "../domain/lessonModel";

export interface LessonModelGateway {
  listModels(): Promise<readonly LessonModelChoice[]>;
  chooseModel(modelId: string): Promise<void>;
}
