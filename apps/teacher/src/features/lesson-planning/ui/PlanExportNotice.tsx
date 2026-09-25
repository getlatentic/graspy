import { InlineNotification } from "@carbon/react";

import type { useLessonPlanExport } from "../../document-export/ui/useLessonPlanExport";

/** How the last attempt to export a plan for approval went. */
export function PlanExportNotice({
  state,
  onDismiss,
}: {
  readonly state: ReturnType<typeof useLessonPlanExport>["state"];
  readonly onDismiss: () => void;
}) {
  if (state.status === "saved" && state.artifact) {
    return (
      <InlineNotification
        kind="success"
        lowContrast
        onCloseButtonClick={onDismiss}
        title="Lesson plan exported"
        subtitle={`Saved ${state.artifact.fileName} for approval.`}
      />
    );
  }
  if (state.status === "failed") {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        onCloseButtonClick={onDismiss}
        title="Lesson plan not exported"
        subtitle={state.message ?? ""}
      />
    );
  }
  return null;
}
