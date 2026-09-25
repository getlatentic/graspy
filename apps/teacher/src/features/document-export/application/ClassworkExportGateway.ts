import type {
  ClassworkPdfArtifact,
  PrepareClassworkExportRequest,
  PreparedClassworkExport,
  SaveClassworkPdfRequest,
} from "../domain/documentExport";

export interface ClassworkExportGateway {
  prepare(request: PrepareClassworkExportRequest): Promise<PreparedClassworkExport>;
  choosePdfDestination(fileName: string): Promise<string | null>;
  savePdf(request: SaveClassworkPdfRequest): Promise<ClassworkPdfArtifact>;
  print(request: PrepareClassworkExportRequest): Promise<void>;
}
