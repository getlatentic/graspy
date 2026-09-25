import { RunningTaskBar } from "../../background-tasks/ui/RunningTaskBar";
import { appTaskStore } from "../../background-tasks/application/appTaskStore";
import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import { useState, type ReactNode } from "react";
import { Outlet } from "react-router";

import type { AcademicWorkspaceGateway } from "../application/AcademicWorkspaceGateway";
import type { SchemeOfWorkGateway } from "../../scheme-of-work/application/SchemeOfWorkGateway";
import type { LessonLaunch } from "../../lesson-planning/domain/lessonPlanning";
import {
  activeAcademicSession,
  activeAcademicPeriod,
  activeTeachingAssignment,
  type AcademicPeriod,
  type AcademicWorkspace,
  type AcademicWorkspaceSnapshot,
  type TeachingAssignment,
} from "../domain/academicWorkspace";
import { AboutYou } from "./AboutYou";
import { AcademicHeader } from "./AcademicHeader";
import { useAcademicWorkspace } from "./useAcademicWorkspace";
import type { CurriculumCatalogGateway } from "../../curriculum-catalog/application/CurriculumCatalogGateway";
import { useCurriculumCatalog } from "../../curriculum-catalog/ui/useCurriculumCatalog";

export interface ActiveAcademicContext {
  readonly workspace: AcademicWorkspace;
  readonly sessionLabel: string;
  readonly period: AcademicPeriod;
  readonly assignment: TeachingAssignment;
}

/** What the workspace layout hands down to whichever screen a route renders. */
export interface WorkspaceOutletContext {
  readonly academicContext: ActiveAcademicContext;
  readonly snapshot: AcademicWorkspaceSnapshot;
  readonly controller: ReturnType<typeof useAcademicWorkspace>;
  readonly curriculumController: ReturnType<typeof useCurriculumCatalog>;
  readonly schemeGateway: SchemeOfWorkGateway;
  readonly launch: LessonLaunch | null;
  readonly setLaunch: (launch: LessonLaunch | null) => void;
  readonly resetToken: number;
  readonly bumpReset: () => void;
  readonly pendingAction: string | null;
  readonly actionError: string | null;
}

interface AcademicWorkspaceShellProps {
  readonly gateway: AcademicWorkspaceGateway;
  readonly curriculumGateway: CurriculumCatalogGateway;
  readonly schemeGateway: SchemeOfWorkGateway;
}

export function AcademicWorkspaceShell({
  gateway,
  curriculumGateway,
  schemeGateway,
}: AcademicWorkspaceShellProps) {
  const controller = useAcademicWorkspace(gateway);
  const curriculumController = useCurriculumCatalog(curriculumGateway);
  const [lessonLaunch, setLessonLaunch] = useState<LessonLaunch | null>(null);
  // Opening a workspace afresh remounts the lessons view with no lesson
  // selected; bumping the token forces that when the class itself has not
  // changed.
  const [resetToken, setResetToken] = useState(0);
  const bumpReset = () => setResetToken((token) => token + 1);

  if (controller.state.status === "loading") {
    return (
      <AppFrame>
        <AcademicHeader />
        <CentredMessage live>
          <InlineLoading description="Opening your classes" status="active" />
        </CentredMessage>
      </AppFrame>
    );
  }

  if (controller.state.status === "failed") {
    return (
      <AppFrame>
        <AcademicHeader />
        <CentredMessage>
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Your classes could not be opened"
            subtitle={controller.state.message}
          />
          <Button kind="tertiary" onClick={() => void controller.reload()}>
            Try again
          </Button>
        </CentredMessage>
      </AppFrame>
    );
  }

  const { snapshot, pendingAction, actionError } = controller.state;
  if (!snapshot.workspace) {
    return (
      <AppFrame>
        <AcademicHeader />
        <AboutYou
          snapshot={snapshot}
          pending={pendingAction === "create-workspace"}
          error={actionError}
          onCreate={controller.createWorkspace}
        />
      </AppFrame>
    );
  }

  const workspace = snapshot.workspace;
  const assignment = activeTeachingAssignment(workspace);
  const session = activeAcademicSession(workspace);
  const period = activeAcademicPeriod(workspace);
  const activeContext: ActiveAcademicContext = {
    workspace,
    sessionLabel: session.label,
    period,
    assignment,
  };

  if (curriculumController.state.status === "loading") {
    return (
      <AppFrame>
        <AcademicHeader workspace={workspace} />
        <CentredMessage live>
          <InlineLoading description="Opening your curriculum library" status="active" />
        </CentredMessage>
      </AppFrame>
    );
  }

  if (curriculumController.state.status === "failed") {
    return (
      <AppFrame>
        <AcademicHeader workspace={workspace} />
        <CentredMessage>
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Curriculum library unavailable"
            subtitle={curriculumController.state.message}
          />
          <Button kind="tertiary" onClick={() => void curriculumController.reload()}>
            Try again
          </Button>
        </CentredMessage>
      </AppFrame>
    );
  }

  const outletContext: WorkspaceOutletContext = {
    academicContext: activeContext,
    snapshot,
    controller,
    curriculumController,
    schemeGateway,
    launch: lessonLaunch,
    setLaunch: setLessonLaunch,
    resetToken,
    bumpReset,
    pendingAction,
    actionError,
  };

  return (
    <AppFrame>
      <AcademicHeader
        workspace={workspace}
        pending={pendingAction !== null}
        onContextChange={async (request) => {
          setLessonLaunch(null);
          return controller.setActiveContext(request);
        }}
      />
      <AppFrame.Scrolls>
        <Outlet context={outletContext} />
      </AppFrame.Scrolls>
      <AppFrame.Floats>
        <RunningTaskBar store={appTaskStore} academicContext={activeContext} />
      </AppFrame.Floats>
    </AppFrame>
  );
}

/**
 * The app's own frame: the height of the window, and nothing outside it moves.
 *
 * The page used to scroll as a whole, which is why a bar anchored to its bottom
 * covered what was under it — bottom-anchoring cannot help while the thing it
 * is anchored to is itself sliding. The frame is a column now: the header
 * stays, and one region scrolls inside it.
 *
 * Six copies of this lived in one file, so the frame the whole app sits in was
 * six places to change.
 */
export function AppFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="group relative flex h-dvh w-full max-w-full flex-col overflow-hidden bg-canvas text-ink [--app-header-block-size:calc(var(--app-header-bar-block-size)+3.25rem)] print:h-auto print:overflow-visible">
      {children}
    </div>
  );
}

/**
 * One short message centred in the frame: opening, or unavailable.
 *
 * `live` announces the message to a screen reader, which is right while
 * something is loading and wrong for an error the teacher has already been
 * moved to.
 */
function CentredMessage({ live = false, children }: { readonly live?: boolean; readonly children: ReactNode }) {
  return (
    <main
      className="mx-auto grid min-h-full w-[min(100%-2rem,40rem)] content-center gap-lg [&_.cds--inline-loading]:w-fit"
      aria-live={live ? "polite" : undefined}
    >
      {children}
    </main>
  );
}

/**
 * The one region that scrolls.
 *
 * Screens size themselves against this rather than against the window, so a
 * task bar below it never covers what they are showing.
 */
AppFrame.Scrolls = function AppFrameScrolls({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto group-has-[[data-task-bar=folded]]:pb-[4.5rem] group-has-[[data-task-bar=open]]:pb-[9rem] print:overflow-visible print:pb-0">
      {children}
    </div>
  );
};

/**
 * What floats over the scrolling region, at the bottom of the frame.
 *
 * Standing in the column instead took a band of height for itself whether or
 * not anything was in it, which cut every screen short and left a grey shelf.
 * Floating gives that height back, and the region reserves room at its end so
 * the last line of a lesson can be scrolled clear rather than trapped beneath.
 *
 * How much room is CSS reading the bar's own `data-task-bar`, not script
 * measuring it: an observer is a moving part that fires on someone else's
 * schedule, and there are places — a headless page with nothing painted — where
 * it never fires at all and the room is silently never reserved.
 *
 * Only what is drawn takes the pointer, so the empty width beside it is not a
 * lid over the screen.
 */
AppFrame.Floats = function AppFrameFloats({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-sticky)] print:hidden [&>*]:pointer-events-auto">
      {children}
    </div>
  );
};
