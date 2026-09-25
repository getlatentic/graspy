import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import { createContext, useContext, type ReactNode } from "react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { SchemeContextSnapshot } from "../domain/schemeOfWork";
import {
  schemeWorkspaceView,
  type SchemeWorkspaceView,
} from "../domain/schemeWorkspaceView";
import { SchemePlanner } from "./SchemePlanner";
import { SchemeStart } from "./SchemeStart";
import type { useSchemeOfWork } from "./useSchemeOfWork";

/** What the workspace hands over, before anything is settled from it. */
export interface SchemeIngredients {
  readonly academicContext: ActiveAcademicContext;
  readonly controller: ReturnType<typeof useSchemeOfWork>;
  readonly onCreateLesson?: (schemeWeekId: string, schemeEntryId: string) => void;
  /** The way into the lesson a weekly plan already has. */
  readonly onOpenLesson?: (lessonId: string) => void;
}

interface SchemeValue extends SchemeIngredients {
  readonly shown: SchemeWorkspaceView;
  readonly snapshot: SchemeContextSnapshot | null;
  readonly pendingAction: string | null;
  readonly actionError: string | null;
  /** The year the session runs from, which the term dates are suggested against. */
  readonly sessionStartYear: number;
}

const Value = createContext<SchemeValue | null>(null);

/** Settles what every screen of the scheme workspace reads. */
export function SchemeValues({
  value,
  children,
}: {
  readonly value: SchemeIngredients;
  readonly children: ReactNode;
}) {
  const state = value.controller.state;
  const snapshot = state.status === "ready" ? state.snapshot : null;
  const workspace = value.academicContext.workspace;
  const session = workspace.sessions.find(({ id }) => id === workspace.activeSessionId);
  // A class is taught in a session; a workspace holding an active session id
  // that names no session is broken in a way no screen can report around.
  if (!session) throw new Error("The active academic session is missing.");
  const settled: SchemeValue = {
    ...value,
    shown: schemeWorkspaceView(state.status, snapshot?.scheme != null),
    snapshot,
    pendingAction: state.status === "ready" ? state.pendingAction : null,
    actionError: state.status === "ready" ? state.actionError : null,
    sessionStartYear: session.startYear,
  };
  return <Value value={settled}>{children}</Value>;
}

function useScheme(): SchemeValue {
  const value = useContext(Value);
  if (!value) throw new Error("A scheme screen was rendered outside its workspace.");
  return value;
}

const centred =
  "mx-auto grid min-h-full w-[min(100%-2rem,42rem)] content-center gap-lg [&_.cds--inline-loading]:w-fit";

/** The store has not answered yet. */
export function SchemeLoading() {
  const { shown } = useScheme();
  if (shown !== "loading") return null;
  return (
    <main className={centred} aria-live="polite">
      <InlineLoading description="Opening the scheme of work" status="active" />
    </main>
  );
}

/** The store could not answer, with the one thing to do about it. */
export function SchemeFailed() {
  const { shown, controller } = useScheme();
  const state = controller.state;
  if (shown !== "failed" || state.status !== "failed") return null;
  return (
    <main className={centred}>
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Scheme of work unavailable"
        subtitle={state.message}
      />
      <Button kind="tertiary" onClick={() => void controller.reload()}>
        Try again
      </Button>
    </main>
  );
}

/** No scheme for this class and term yet: the ways to begin one. */
export function SchemeStartScreen() {
  const { shown, snapshot, academicContext, sessionStartYear, pendingAction, actionError, controller } =
    useScheme();
  if (shown !== "start" || !snapshot) return null;
  return (
    <SchemeStart
      academicContext={academicContext}
      sessionStartYear={sessionStartYear}
      templates={snapshot.availableTemplates}
      pendingAction={pendingAction}
      error={actionError}
      onCreateManual={controller.createScheme}
      onCreateFromTemplate={controller.createSchemeFromTemplate}
      onImport={controller.installTemplatePackage}
    />
  );
}

/** The scheme this class and term are teaching, week by week. */
export function SchemePlannerScreen() {
  const { shown, snapshot, pendingAction, actionError, controller, onCreateLesson, onOpenLesson } =
    useScheme();
  if (shown !== "planner" || !snapshot?.scheme) return null;
  return (
    <SchemePlanner
      scheme={snapshot.scheme}
      pendingAction={pendingAction}
      error={actionError}
      onSaveWeek={controller.saveWeek}
      onSaveEntry={controller.saveEntry}
      onArchiveEntry={controller.archiveEntry}
      onMoveEntry={controller.moveEntry}
      onCreateLesson={onCreateLesson}
      onOpenLesson={onOpenLesson}
    />
  );
}
