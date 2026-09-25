import type { ReactNode } from "react";
import { Button } from "@carbon/react";

import {
  activeAcademicPeriod,
  activeAcademicSession,
  assignmentsForSession,
  type AcademicWorkspace,
} from "../domain/academicWorkspace";
import type { ClassListing } from "../../class-timetable/domain/classTimetable";
import { ClassCard } from "./ClassCard";
import {
  cardGrid,
  dashboardShell,
  dashboardSummary,
  dashboardTitle,
} from "./workspaceCards";
import { eyebrow } from "../../../ui/chrome";


interface HomeProps {
  readonly workspace: AcademicWorkspace;
  readonly onOpenWorkspace: (assignmentId: string) => void;
  /** A class with no term planned leads there instead of into its lessons. */
  readonly onPlanTerm: (assignmentId: string) => void;
  readonly onAddClass: () => void;
  /** Which classes to list, and what to call them. */
  readonly listing: ClassListing;
  /** The classes today holds, when today names any. */
  readonly todaysClasses: readonly string[];
  /** What happens next, composed by whoever knows the timetable. */
  readonly children?: ReactNode;
}

/**
 * The teacher lands here, on their term at a glance: every class they teach this
 * session as a card showing how ready its lessons are and where its scheme
 * stands, and a way into each. No teacher name is shown — the app has no account
 * yet, so the greeting stays nameless rather than inventing one.
 */
export function Home({
  workspace,
  onOpenWorkspace,
  onPlanTerm,
  onAddClass,
  listing,
  todaysClasses,
  children,
}: HomeProps) {
  const session = activeAcademicSession(workspace);
  const period = activeAcademicPeriod(workspace);
  const teaching = assignmentsForSession(workspace, workspace.activeSessionId).filter(
    (assignment) => assignment.status === "active",
  );
  // Today's classes come back in the order they are taught, so the list reads
  // the way the day runs rather than the way the classes were added.
  const assignments =
    listing.kind === "today"
      ? todaysClasses
          .map((id) => teaching.find((assignment) => assignment.id === id))
          .filter((assignment) => assignment !== undefined)
      : teaching;
  const count = teaching.length;

  return (
    <main className={dashboardShell}>
      <header>
        <p className={eyebrow}>Home</p>
        <h1 className={dashboardTitle}>This week</h1>
        <p className={dashboardSummary}>
          {count} {count === 1 ? "class" : "classes"} · {session.label} · {period.name}
        </p>
      </header>

      {children}

      <section aria-labelledby="home-workspaces">
        {/* A teacher who starts here could not add a class from here, and had
            to find the list a second time to do it. */}
        <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <div>
            <h2 className="m-0 text-[1.5rem] font-normal text-ink" id="home-workspaces">
              {listing.heading}
            </h2>
            {listing.kind === "all" ? (
              <p className="m-0 mt-2xs text-sm text-muted">{listing.because}</p>
            ) : null}
          </div>
          <Button kind="tertiary" size="md" onClick={onAddClass}>
            Add subject and class
          </Button>
        </div>
        <ul className={cardGrid}>
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              <ClassCard
                assignment={assignment}
                termName={period.name}
                onOpen={onOpenWorkspace}
                onPlanTerm={onPlanTerm}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
