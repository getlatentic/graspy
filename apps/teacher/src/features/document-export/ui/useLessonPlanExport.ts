import { useState } from "react";

import type { LessonPlanExportGateway } from "../application/LessonPlanExportGateway";
import type { ClassworkPdfArtifact, LessonPlanExportInput } from "../domain/documentExport";

/** Where a plan export is: idle, being written, saved to a file, or failed. */
export interface LessonPlanExportState {
  readonly status: "idle" | "exporting" | "saved" | "failed";
  readonly artifact: ClassworkPdfArtifact | null;
  readonly message: string | null;
}

const IDLE: LessonPlanExportState = { status: "idle", artifact: null, message: null };

export function useLessonPlanExport(gateway: LessonPlanExportGateway) {
  const [state, setState] = useState<LessonPlanExportState>(IDLE);

  const savePlan = async (fileName: string, input: LessonPlanExportInput) => {
    const destination = await gateway.choosePdfDestination(fileName);
    if (!destination) return;
    setState({ status: "exporting", artifact: null, message: null });
    try {
      const artifact = await gateway.savePdf({ document: input, destinationPath: destination });
      setState({ status: "saved", artifact, message: null });
    } catch (error) {
      setState({ status: "failed", artifact: null, message: describe(error) });
    }
  };

  const dismiss = () => setState(IDLE);

  return { state, savePlan, dismiss };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "The lesson plan could not be exported. Try again.";
}
