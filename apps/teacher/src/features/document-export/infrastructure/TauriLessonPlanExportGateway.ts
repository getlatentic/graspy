import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { LessonPlanExportGateway } from "../application/LessonPlanExportGateway";
import {
  classworkPdfArtifactSchema,
  type LessonPlanExportInput,
  type SaveLessonPlanPdfRequest,
} from "../domain/documentExport";

type SaveDialog = (options: {
  readonly defaultPath: string;
  readonly filters: Array<{ readonly name: string; readonly extensions: string[] }>;
}) => Promise<string | null>;

export class TauriLessonPlanExportGateway implements LessonPlanExportGateway {
  constructor(
    private readonly nativeInvoke: NativeInvoke = invoke,
    private readonly saveDialog: SaveDialog = save,
  ) {}

  choosePdfDestination(fileName: string) {
    return this.saveDialog({
      defaultPath: fileName,
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
  }

  async savePdf(request: SaveLessonPlanPdfRequest) {
    return classworkPdfArtifactSchema.parse(
      await this.nativeInvoke("save_lesson_plan_pdf", { request }),
    );
  }

  async print(input: LessonPlanExportInput) {
    await this.nativeInvoke("print_lesson_plan_document", { input });
  }
}
