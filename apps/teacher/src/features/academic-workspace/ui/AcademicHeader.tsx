import { Dropdown } from "@carbon/react";
import { NavLink, useLocation } from "react-router";

import {
  assignmentsForSession,
  periodsForSession,
  type AcademicWorkspace,
  type SetActiveAcademicContextRequest,
} from "../domain/academicWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface AcademicHeaderProps {
  readonly workspace?: AcademicWorkspace;
  readonly pending?: boolean;
  readonly onContextChange?: (
    request: SetActiveAcademicContextRequest,
  ) => Promise<boolean>;
}

/**
 * The chrome the design carries: a quiet top bar for the wordmark, Home and
 * Classes, the year and term (they change rarely), and settings; and, only once
 * a teacher is inside a workspace, a second bar naming the class and subject
 * with its views as tabs. The scope a teacher works inside is a place they are.
 */
export function AcademicHeader({
  workspace,
  pending = false,
  onContextChange,
}: AcademicHeaderProps) {
  const { pathname } = useLocation();
  const insideWorkspace =
    pathname.startsWith("/lessons") || pathname.startsWith("/plan");
  const assignments = workspace
    ? assignmentsForSession(workspace, workspace.activeSessionId)
    : [];
  const activeSession = workspace?.sessions.find(
    ({ id }) => id === workspace.activeSessionId,
  );
  const periods = workspace
    ? periodsForSession(workspace, workspace.activeSessionId)
    : [];
  const activePeriod = periods.find(
    ({ id }) => id === workspace?.activePeriodId,
  );
  const activeAssignment = assignments.find(
    ({ id }) => id === workspace?.activeAssignmentId,
  );

  const switchContext = (
    update: Partial<SetActiveAcademicContextRequest>,
  ) => {
    if (!workspace || !onContextChange) return;
    void onContextChange({
      academicSessionId: workspace.activeSessionId,
      academicPeriodId: workspace.activePeriodId,
      assignmentId: workspace.activeAssignmentId,
      ...update,
    });
  };

  const switchSession = (sessionId: string) => {
    if (!workspace) return;
    const firstAssignment = assignmentsForSession(workspace, sessionId)[0];
    const firstPeriod = periodsForSession(workspace, sessionId)[0];
    if (!firstAssignment || !firstPeriod) return;
    switchContext({
      academicSessionId: sessionId,
      academicPeriodId: firstPeriod.id,
      assignmentId: firstAssignment.id,
    });
  };

  const sprout = (
    <svg className="block flex-none" viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <path d="M12 22V11.5" stroke="#0F7838" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 13.5C12 8 7.5 4.5 2.6 5.1C2.6 10.6 6.5 14.1 12 13.5Z" fill="#6BC62A" />
      <path d="M12 11.5C12 6.2 16 2.8 21.4 3.4C21.4 8.9 17 12.1 12 11.5Z" fill="#0F7838" />
    </svg>
  );
  const brand = (
    <NavLink to="/" className="group/brand flex min-w-0 items-center gap-[0.5rem] border-0 bg-transparent p-0 text-start cursor-pointer no-underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4" aria-label="graspy — home">
      {sprout}
      <span className="font-wordmark text-[1.5rem] font-extrabold leading-none tracking-[-0.02em] text-brand group-hover/brand:text-accent-hover">graspy</span>
    </NavLink>
  );

  return (
    // The header stays put while a lesson scrolls under it.
    //
    // Sixteen files size themselves against `--app-header-block-size` and seven
    // pin themselves below it, all of which is only true if the header is still
    // there. It was not: it scrolled away, so the week list pinned a header's
    // height below the top of the screen with a dead band above it while the
    // lesson beside it kept moving, and the teacher lost which class and term
    // they were in.
    <div className="flex-none print:static">
      <header className={`flex w-full min-w-0 max-w-full min-h-[var(--app-header-bar-block-size)] flex-none items-center justify-between gap-md border-b border-rule bg-paper px-md py-xs text-ink sm:px-lg print:hidden${workspace ? " flex-wrap gap-sm" : ""}`}>
        <div className="flex min-w-0 items-center gap-md">
          {brand}
          {workspace ? (
            <nav className="flex items-center gap-3xs border-s border-rule ps-md" aria-label="Sections">
              <NavLink to="/" end className="inline-flex min-h-[2.375rem] items-center gap-2xs rounded-[10px] px-[0.75rem] text-sm font-medium text-ink no-underline hover:bg-paper-soft [&.active]:bg-paper-accent [&.active]:text-brand">
                <svg viewBox="0 0 32 32" width="17" height="17" fill="currentColor" aria-hidden="true">
                  <path d="M16.6123,2.2138a1.01,1.01,0,0,0-1.2427,0L1,13.4194l1.2427,1.5717L4,13.6209V26a2.0041,2.0041,0,0,0,2,2H26a2.0037,2.0037,0,0,0,2-2V13.63L29.7573,15,31,13.4282ZM18,26H14V18h4Zm2,0V18a2.0023,2.0023,0,0,0-2-2H14a2.002,2.002,0,0,0-2,2v8H6V12.0615l10-7.79,10,7.8005V26Z" />
                </svg>
                Home
              </NavLink>
              <NavLink to="/classes" className="inline-flex min-h-[2.375rem] items-center gap-2xs rounded-[10px] px-[0.75rem] text-sm font-medium text-ink no-underline hover:bg-paper-soft [&.active]:bg-paper-accent [&.active]:text-brand">
                <svg viewBox="0 0 32 32" width="17" height="17" fill="currentColor" aria-hidden="true">
                  <path d="M16,8a5,5,0,1,0,5,5A5,5,0,0,0,16,8Zm0,8a3,3,0,1,1,3-3A3.0034,3.0034,0,0,1,16,16Z" />
                  <path d="M16,2A14,14,0,1,0,30,16,14.0158,14.0158,0,0,0,16,2ZM10,26.3765V25a3.0033,3.0033,0,0,1,3-3h6a3.0033,3.0033,0,0,1,3,3v1.3765a11.8989,11.8989,0,0,1-12,0Zm13.9925-1.4507A5.0016,5.0016,0,0,0,19,20H13a5.0016,5.0016,0,0,0-4.9925,4.9258,12,12,0,1,1,15.985,0Z" />
                </svg>
                Classes
              </NavLink>
              <NavLink to="/timetable" className="inline-flex min-h-[2.375rem] items-center gap-2xs rounded-[10px] px-[0.75rem] text-sm font-medium text-ink no-underline hover:bg-paper-soft [&.active]:bg-paper-accent [&.active]:text-brand">
                <svg viewBox="0 0 32 32" width="17" height="17" fill="currentColor" aria-hidden="true">
                  <path d="M26,4H22V2H20V4H12V2H10V4H6A2,2,0,0,0,4,6V26a2,2,0,0,0,2,2H26a2,2,0,0,0,2-2V6A2,2,0,0,0,26,4Zm0,22H6V12H26ZM6,10V6h4V8h2V6h8V8h2V6h4v4Z" />
                </svg>
                Timetable
              </NavLink>
            </nav>
          ) : null}
        </div>
        {workspace ? (
          <div className="flex min-w-0 items-center gap-2xs" aria-label="Academic year and term">
            <label className="flex min-w-0 items-center gap-2xs">
              <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted">Year</span>
              <Dropdown
                className="scope-picker-control [&_.cds--list-box\_\_field]:min-h-[2.25rem] [&_.cds--list-box\_\_field]:bg-transparent [&_.cds--list-box\_\_field]:text-ink [&_.cds--list-box\_\_field:hover]:bg-paper-soft [&_.cds--list-box\_\_menu]:z-[var(--z-sticky)] [&_.cds--list-box\_\_label]:truncate [&_.cds--list-box\_\_menu-item\_\_option]:truncate"
                id="active-session"
                aria-label="Academic session"
                hideLabel
                titleText="Academic session"
                label="Choose a session"
                items={workspace.sessions}
                itemToString={(session) => session?.label ?? ""}
                selectedItem={activeSession}
                size="sm"
                autoAlign
                disabled={pending}
                onChange={({ selectedItem }) => {
                  if (selectedItem) switchSession(selectedItem.id);
                }}
              />
            </label>
            <label className="flex min-w-0 items-center gap-2xs">
              <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted">Term</span>
              <Dropdown
                className="scope-picker-control [&_.cds--list-box\_\_field]:min-h-[2.25rem] [&_.cds--list-box\_\_field]:bg-transparent [&_.cds--list-box\_\_field]:text-ink [&_.cds--list-box\_\_field:hover]:bg-paper-soft [&_.cds--list-box\_\_menu]:z-[var(--z-sticky)] [&_.cds--list-box\_\_label]:truncate [&_.cds--list-box\_\_menu-item\_\_option]:truncate"
                id="active-period"
                aria-label="Academic period"
                hideLabel
                titleText="Academic period"
                label="Choose a period"
                items={periods}
                itemToString={(period) => period?.name ?? ""}
                selectedItem={activePeriod}
                size="sm"
                autoAlign
                disabled={pending}
                onChange={({ selectedItem }) => {
                  if (selectedItem) {
                    switchContext({ academicPeriodId: selectedItem.id });
                  }
                }}
              />
            </label>
            <button type="button" className="grid size-[2.75rem] flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-paper-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4" aria-label="Settings">
              <svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M27,16.76c0-.25,0-.5,0-.76s0-.51,0-.77l1.92-1.68A2,2,0,0,0,29.3,11l-2.36-4.08a2,2,0,0,0-2.37-.91l-2.43.8a11.66,11.66,0,0,0-1.32-.77l-.51-2.53A2,2,0,0,0,18.35,2H13.65a2,2,0,0,0-2,1.61l-.51,2.53a11.66,11.66,0,0,0-1.32.77l-2.43-.8a2,2,0,0,0-2.37.91L2.7,11a2,2,0,0,0,.41,2.51L5,15.23c0,.25,0,.5,0,.77s0,.52,0,.77L3.11,18.44A2,2,0,0,0,2.7,21l2.36,4.08a2,2,0,0,0,2.37.91l2.43-.8a11.66,11.66,0,0,0,1.32.77l.51,2.53A2,2,0,0,0,13.65,30h4.7a2,2,0,0,0,2-1.61l.51-2.53a11.66,11.66,0,0,0,1.32-.77l2.43.8a2,2,0,0,0,2.37-.91L29.3,21a2,2,0,0,0-.41-2.51ZM16,22a6,6,0,1,1,6-6A6,6,0,0,1,16,22Z" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="flex-none whitespace-nowrap text-sm font-bold text-muted">Your classes</span>
        )}
      </header>
      {workspace && insideWorkspace ? (
        <div className="flex min-h-[3.25rem] flex-none flex-wrap items-center justify-between gap-y-sm gap-x-md border-b border-rule bg-paper px-md py-2xs">
          <div className="flex min-w-0 items-center gap-sm">
            <span className="grid size-[1.875rem] flex-none place-items-center rounded-[9px] bg-paper-accent text-brand" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor">
                <path d="M26,4H6A2,2,0,0,0,4,6V26a2,2,0,0,0,2,2H26a2,2,0,0,0,2-2V6A2,2,0,0,0,26,4Zm0,2v6H6V6ZM16,26V14H26V26Zm-2,0H6V14h8Z" />
              </svg>
            </span>
            <WorkspaceSwitcher
              assignments={assignments}
              activeAssignment={activeAssignment}
              disabled={pending}
              onSelect={(assignmentId) => switchContext({ assignmentId })}
            />
          </div>
          <nav className="flex items-stretch gap-2xs" aria-label="Workspace views">
            <NavLink to="/lessons" className="relative inline-flex min-h-[2.75rem] cursor-pointer items-center border-0 bg-transparent px-sm text-sm font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 aria-[current=page]:text-accent aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-sm aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-[2px] aria-[current=page]:after:bg-accent aria-[current=page]:after:content-['']">
              Lessons
            </NavLink>
            <NavLink to="/plan" className="relative inline-flex min-h-[2.75rem] cursor-pointer items-center border-0 bg-transparent px-sm text-sm font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 aria-[current=page]:text-accent aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-sm aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-[2px] aria-[current=page]:after:bg-accent aria-[current=page]:after:content-['']">
              Plan my term
            </NavLink>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
