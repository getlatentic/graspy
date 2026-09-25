import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { ModelAcquisitionGateway } from "../application/ModelAcquisitionGateway";
import type {
  ModelAcquisitionProgress,
  ModelInstallationSnapshot,
} from "../domain/modelAcquisition";

const PROGRESS_EVENT = "model-acquisition-progress";

/**
 * Which of a model's files a gateway installs. Each is fetched, proved and
 * recorded the same way, so only the names differ.
 */
export interface AcquiredFileCommands {
  readonly installation: string;
  readonly download: string;
  readonly import: string;
  /** What the file picker is titled when the file comes off a stick. */
  readonly chooseTitle: string;
}

/** The model itself, without which graspy cannot write a lesson. */
export const LESSON_ENGINE_FILE: AcquiredFileCommands = {
  installation: "get_model_installation",
  download: "download_model",
  import: "import_model",
  chooseTitle: "Choose the graspy offline setup file",
};

/** What graspy reads a photographed lesson plan with. */
export const PHOTOGRAPH_READING_FILE: AcquiredFileCommands = {
  installation: "get_photograph_reading_installation",
  download: "download_photograph_reading",
  import: "import_photograph_reading",
  chooseTitle: "Choose the graspy photograph reading file",
};

export class TauriModelAcquisitionGateway implements ModelAcquisitionGateway {
  constructor(private readonly commands: AcquiredFileCommands = LESSON_ENGINE_FILE) {}

  getInstallation(): Promise<ModelInstallationSnapshot> {
    return invoke(this.commands.installation);
  }

  download(requestId: string): Promise<ModelInstallationSnapshot> {
    return invoke(this.commands.download, { requestId });
  }

  async chooseImportFile(): Promise<string | null> {
    const selected = await open({
      directory: false,
      multiple: false,
      title: this.commands.chooseTitle,
      filters: [{ name: "graspy setup file", extensions: ["gguf"] }],
    });
    return typeof selected === "string" ? selected : null;
  }

  importFile(
    requestId: string,
    sourcePath: string,
  ): Promise<ModelInstallationSnapshot> {
    return invoke(this.commands.import, { requestId, sourcePath });
  }

  cancel(requestId: string): Promise<void> {
    return invoke("cancel_model_acquisition", { requestId });
  }

  subscribe(
    listener: (progress: ModelAcquisitionProgress) => void,
  ): Promise<() => void> {
    return listen<ModelAcquisitionProgress>(PROGRESS_EVENT, ({ payload }) => {
      listener(payload);
    });
  }
}
