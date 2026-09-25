import { InlineLoading } from "@carbon/react";
import { lazy, Suspense } from "react";

import type { DifferentiatedClassworkGateway } from "../../differentiated-classwork/application/DifferentiatedClassworkGateway";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import type { LessonEvidenceGateway } from "../../learner-evidence/application/LessonEvidenceGateway";
import type { ClassworkGateway } from "../../classwork/application/ClassworkGateway";
import type { LessonContextRequest } from "../domain/lessonPlanning";
import { afterLeaving, type LessonPaneWork } from "./model/lessonPaneWork";

const ClassworkWorkspace = lazy(() =>
  import("../../classwork/ui/ClassworkWorkspace").then(({ ClassworkWorkspace: component }) => ({ default: component })),
);

const LessonEvidenceWorkspace = lazy(() =>
  import("../../learner-evidence/ui/LessonEvidenceWorkspace").then(({ LessonEvidenceWorkspace: component }) => ({ default: component })),
);

const DifferentiatedClassworkWorkspace = lazy(() =>
  import("../../differentiated-classwork/ui/DifferentiatedClassworkWorkspace").then(({ DifferentiatedClassworkWorkspace: component }) => ({ default: component })),
);

const OPENING_LABELS = {
  classwork: "Opening the classwork",
  groupClasswork: "Opening the group classwork",
  classResults: "Opening class results",
} as const;

interface Props {
  readonly work: LessonPaneWork;
  readonly context: LessonContextRequest;
  readonly classworkGateway: ClassworkGateway;
  readonly differentiatedClassworkGateway: DifferentiatedClassworkGateway;
  readonly evidenceGateway: LessonEvidenceGateway;
  readonly exportGateway?: ClassworkExportGateway;
  readonly onOpen: (work: LessonPaneWork | null) => void;
}

/**
 * A lesson's deeper work, in the lesson's own pane.
 *
 * Each of these carries its own code, loaded when a teacher asks for it. Where
 * leaving lands is [`afterLeaving`]'s to say, so no screen here decides it.
 */
export function LessonPaneWorkView({
  work,
  context,
  classworkGateway,
  differentiatedClassworkGateway,
  evidenceGateway,
  exportGateway,
  onOpen,
}: Props) {
  const leave = () => onOpen(afterLeaving(work));
  return (
    <Suspense
      fallback={
        <div className="grid content-center gap-lg py-3xl">
          <InlineLoading description={OPENING_LABELS[work.kind]} status="active" />
        </div>
      }
    >
      {work.kind === "classwork" ? (
        <ClassworkWorkspace
          lessonId={work.lessonId}
          context={context}
          gateway={classworkGateway}
          exportGateway={exportGateway}
          onBack={leave}
          onOpenGroupClasswork={() => onOpen({ kind: "groupClasswork", lessonId: work.lessonId })}
        />
      ) : work.kind === "groupClasswork" ? (
        <DifferentiatedClassworkWorkspace
          lessonId={work.lessonId}
          context={context}
          gateway={differentiatedClassworkGateway}
          exportGateway={exportGateway}
          onBack={leave}
        />
      ) : (
        <LessonEvidenceWorkspace
          lessonId={work.lessonId}
          context={context}
          gateway={evidenceGateway}
          onBack={leave}
        />
      )}
    </Suspense>
  );
}
