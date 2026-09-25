import { Button } from "@carbon/react";

import {
  assignmentsForSession,
  type AcademicWorkspace,
  activeAcademicPeriod,
} from "../domain/academicWorkspace";
import { ClassCard } from "./ClassCard";
import {
  cardGrid,
  dashboardShell,
  dashboardSummary,
  dashboardTitle,
} from "./workspaceCards";
import { eyebrow } from "../../../ui/chrome";


interface ClassesDashboardProps {
  readonly workspace: AcademicWorkspace;
  readonly onOpenWorkspace: (assignmentId: string) => void;
  /** A class with no term planned leads there instead of into its lessons. */
  readonly onPlanTerm: (assignmentId: string) => void;
  readonly onManage: () => void;
}

/**
 * Every class the teacher takes this session, in more detail than Home: where
 * its scheme stands and what it teaches next, with a way in. Managing the list —
 * adding a class, its curriculum, a session — is a step to the side, not the
 * point of the screen. Pupils are absent by the owner's decision.
 */
export function ClassesDashboard({ workspace, onOpenWorkspace, onPlanTerm, onManage }: ClassesDashboardProps) {
  const assignments = assignmentsForSession(workspace, workspace.activeSessionId).filter(
    (assignment) => assignment.status === "active",
  );
  const activePeriod = activeAcademicPeriod(workspace);

  return (
    <main className={dashboardShell}>
      <header className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className={eyebrow}>Classes</p>
          <h1 className={dashboardTitle}>Your classes &amp; subjects</h1>
          <p className={dashboardSummary}>
            Pick a class to plan its term, its lessons and its classwork.
          </p>
        </div>
        <Button kind="tertiary" size="md" onClick={onManage}>
          Add subject and class
        </Button>
      </header>

      <ul className={cardGrid}>
        {assignments.map((assignment) => (
          <li key={assignment.id}>
            <ClassCard
              assignment={assignment}
              termName={activePeriod.name}
              onOpen={onOpenWorkspace}
              onPlanTerm={onPlanTerm}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
