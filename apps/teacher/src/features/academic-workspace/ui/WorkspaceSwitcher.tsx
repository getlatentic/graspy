import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { TeachingAssignment } from "../domain/academicWorkspace";
import { classFirstLabel } from "./assignmentLabel";
import { groupByClass } from "./assignmentGrouping";

interface WorkspaceSwitcherProps {
  readonly assignments: readonly TeachingAssignment[];
  readonly activeAssignment: TeachingAssignment | undefined;
  readonly disabled?: boolean;
  readonly onSelect: (assignmentId: string) => void;
}

/**
 * The workspace a teacher is in, and the way to change it: a class-first label
 * with a Change workspace button that opens a searchable list grouped by class,
 * as the design lays it out. It changes which class is active; routing to that
 * workspace is a separate concern.
 */
export function WorkspaceSwitcher({
  assignments,
  activeAssignment,
  disabled = false,
  onSelect,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? assignments.filter((assignment) =>
          assignment.displayName.toLowerCase().includes(needle),
        )
      : assignments;
    return groupByClass(matching);
  }, [assignments, query]);

  const choose = (assignmentId: string) => {
    setOpen(false);
    setQuery("");
    if (assignmentId !== activeAssignment?.id) onSelect(assignmentId);
  };

  return (
    <div className="relative flex min-w-0 items-center gap-sm" ref={rootRef}>
      <span className="truncate text-[1.0625rem] font-semibold text-ink">{classFirstLabel(activeAssignment?.displayName)}</span>
      <button
        type="button"
        className="inline-flex min-h-[2rem] flex-none cursor-pointer items-center gap-2xs rounded-[9px] border border-accent-soft bg-transparent px-[0.75rem] text-sm font-semibold text-brand enabled:hover:bg-paper-accent focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:text-muted"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Change class
        <svg viewBox="0 0 32 32" width="12" height="12" fill="currentColor" aria-hidden="true">
          <polygon points="16,22 6,12 7.4,10.6 16,19.2 24.6,10.6 26,12" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+var(--spacing-2xs))] z-[var(--z-sticky)] flex max-h-[min(28rem,70vh)] w-[min(20rem,90vw)] flex-col overflow-hidden rounded-[14px] border border-rule bg-paper shadow-overlay" id={panelId} role="dialog" aria-label="Change workspace">
          <div className="m-sm flex min-h-[2.375rem] flex-none items-center gap-2xs rounded-[10px] border border-rule bg-paper-soft px-sm text-muted">
            <svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M29,27.5859l-7.5521-7.5521a11.0177,11.0177,0,1,0-1.4141,1.4141L27.5859,29ZM4,13a9,9,0,1,1,9,9A9.01,9.01,0,0,1,4,13Z" />
            </svg>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-ink [font:inherit] focus:outline-none"
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search class or subject"
              aria-label="Search class or subject"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="overflow-y-auto px-2xs pb-2xs">
            {groups.length === 0 ? (
              <p className="m-0 p-sm text-sm text-muted">No class or subject matches “{query}”.</p>
            ) : (
              groups.map((group) => (
                <div className="mt-2xs first:mt-0" key={group.classLabel}>
                  <p className="m-0 px-sm pt-xs pb-[2px] text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-muted">{group.classLabel}</p>
                  {group.members.map(({ assignment, subject }) => {
                    const isActive = assignment.id === activeAssignment?.id;
                    return (
                      <button
                        type="button"
                        key={assignment.id}
                        className="flex min-h-[2.75rem] w-full cursor-pointer items-center justify-between gap-sm rounded-[9px] border-0 bg-transparent px-sm text-start text-[1rem] text-ink hover:bg-paper-soft focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 aria-[current=true]:font-semibold aria-[current=true]:text-brand"
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => choose(assignment.id)}
                      >
                        <span>{subject}</span>
                        {isActive ? (
                          <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <path d="M13,24,4,15l1.4142-1.4142L13,21.1716,26.5858,7.5858,28,9Z" />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
