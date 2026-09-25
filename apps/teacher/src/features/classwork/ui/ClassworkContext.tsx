import type { ReactNode } from "react";

import type { BackgroundTask } from "../../background-tasks/domain/backgroundTask";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { ClassworkGateway } from "../application/ClassworkGateway";
import type { ClassworkWorkspaceSnapshot } from "../domain/classwork";
import type { useClassworkGeneration } from "./useClassworkGeneration";
import { ClassworkValueContext } from "./useClasswork";

/** What the workspace hands over, before anything is settled from it. */
export interface ClassworkIngredients {
  readonly lessonId: string;
  readonly context: LessonContextRequest;
  readonly gateway: ClassworkGateway;
  readonly exportGateway?: ClassworkExportGateway;
  readonly controller: ReturnType<typeof useClassworkGeneration>;
  /**
   * The app's record of this lesson's classwork run, if one is going.
   *
   * Sections sit as pending while their run waits its turn at the engine, which
   * reads exactly like a run nobody has started. This is how the panel tells
   * the difference and stops offering to start it again.
   */
  readonly underWay: BackgroundTask | null;
  readonly onBack: () => void;
  readonly onOpenGroupClasswork?: () => void;
}

type Run = NonNullable<ClassworkWorkspaceSnapshot["run"]>;

/** The ingredients plus everything settled from them, stated once. */
export interface ClassworkValue extends ClassworkIngredients {
  readonly shown: "loading" | "failed" | "classwork";
  readonly snapshot: ClassworkWorkspaceSnapshot | null;
  readonly actionError: string | null;
  readonly run: Run | null;
  /** A section is being written now, so leaving would abandon work in progress. */
  readonly generating: boolean;
  /** At least one section is saved, so there is a document to read. */
  readonly hasSavedSections: boolean;
  readonly complete: boolean;
}

/**
 * Settles what every screen of the classwork workspace reads.
 *
 * The store's own status is the decision here — there is no fourth thing this
 * screen can be — so it is read straight rather than dressed as a rule.
 */
export function ClassworkValues({
  value,
  children,
}: {
  readonly value: ClassworkIngredients;
  readonly children: ReactNode;
}) {
  const state = value.controller.state;
  const snapshot = state.status === "ready" ? state.snapshot : null;
  const run = snapshot?.run ?? null;
  const settled: ClassworkValue = {
    ...value,
    shown: state.status === "ready" ? "classwork" : state.status,
    snapshot,
    actionError: state.status === "ready" ? state.actionError : null,
    run,
    generating: run?.sections.some(({ status }) => status === "generating") ?? false,
    hasSavedSections: run?.sections.some(({ status }) => status === "done") ?? false,
    complete: run?.status === "complete",
  };
  return <ClassworkValueContext value={settled}>{children}</ClassworkValueContext>;
}
