import type {
  ModelAcquisitionProgress,
  ModelInstallationSnapshot,
} from "../domain/modelAcquisition";

export interface ModelAcquisitionGateway {
  getInstallation(): Promise<ModelInstallationSnapshot>;
  download(requestId: string): Promise<ModelInstallationSnapshot>;
  chooseImportFile(): Promise<string | null>;
  importFile(requestId: string, sourcePath: string): Promise<ModelInstallationSnapshot>;
  cancel(requestId: string): Promise<void>;
  subscribe(
    listener: (progress: ModelAcquisitionProgress) => void,
  ): Promise<() => void>;
}
