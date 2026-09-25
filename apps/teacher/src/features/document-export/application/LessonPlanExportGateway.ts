import type {
  ClassworkPdfArtifact,
  LessonPlanExportInput,
  SaveLessonPlanPdfRequest,
} from "../domain/documentExport";

/**
 * Turns a finished lesson plan into an approval document — a PDF a teacher can
 * hand to whoever signs their lessons off, or send straight to the printer.
 */
export interface LessonPlanExportGateway {
  choosePdfDestination(fileName: string): Promise<string | null>;
  savePdf(request: SaveLessonPlanPdfRequest): Promise<ClassworkPdfArtifact>;
  print(input: LessonPlanExportInput): Promise<void>;
}
