import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { ClassworkExportGateway } from "../application/ClassworkExportGateway";
import {
  classworkPdfArtifactSchema,
  preparedClassworkExportSchema,
  type PrepareClassworkExportRequest,
  type SaveClassworkPdfRequest,
} from "../domain/documentExport";

type SaveDialog = (options: {
  readonly defaultPath: string;
  readonly filters: Array<{ readonly name: string; readonly extensions: string[] }>;
}) => Promise<string | null>;

export class TauriClassworkExportGateway implements ClassworkExportGateway {
  constructor(
    private readonly nativeInvoke: NativeInvoke = invoke,
    private readonly saveDialog: SaveDialog = save,
  ) {}

  async prepare(request: PrepareClassworkExportRequest) {
    return preparedClassworkExportSchema.parse(
      await this.nativeInvoke("prepare_classwork_export", { request }),
    );
  }

  choosePdfDestination(fileName: string) {
    return this.saveDialog({
      defaultPath: fileName,
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
  }

  async savePdf(request: SaveClassworkPdfRequest) {
    return classworkPdfArtifactSchema.parse(
      await this.nativeInvoke("save_classwork_pdf", { request }),
    );
  }

  async print(request: PrepareClassworkExportRequest) {
    await this.nativeInvoke("print_classwork_document", { request });
  }
}
