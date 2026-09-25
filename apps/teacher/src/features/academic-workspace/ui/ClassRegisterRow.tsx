import { Button } from "@carbon/react";
import type { ReactNode } from "react";

import { StatusPill } from "../../../ui/StatusPill";
import type { TeachingAssignment } from "../domain/academicWorkspace";

/**
 * One class in the register: what is taught to whom, and what can be done
 * about it.
 *
 * An archived class keeps its line but offers nothing — it is history, not
 * something to edit or attach a curriculum to.
 */
export function ClassRegisterRow({
  assignment,
  editor,
  archiving,
  curriculumPicker,
}: {
  readonly assignment: TeachingAssignment;
  /**
   * The editor open on this row, if it is this row's turn.
   *
   * Only one class can be edited at a time — the register would otherwise
   * offer two forms writing to the same list — so whose turn it is belongs to
   * the register, not to a row.
   */
  readonly editor: ReactNode | null;
  readonly archiving: {
    /** True once archiving has been asked for and is waiting to be confirmed. */
    readonly armed: boolean;
    readonly pending: boolean;
    readonly onEdit: () => void;
    readonly onArm: () => void;
    readonly onCancel: () => void;
    readonly onConfirm: () => void;
  };
  readonly curriculumPicker: ReactNode;
}) {
  return (
    <article
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-sm border-b border-rule p-lg last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      role="listitem"
    >
      {editor ?? (
        <>
          <div>
            <h3 className="m-0 text-base font-extrabold text-ink">{assignment.subject}</h3>
            <p className="mt-2xs mb-0 text-ink-secondary">
              {assignment.gradeLevel}
              {assignment.classSection ? ` · ${assignment.classSection}` : ""}
            </p>
            <p className="mt-2xs mb-0 text-sm text-muted">
              {assignment.curriculumTitle && assignment.curriculumPublisher
                ? `${assignment.curriculumTitle} · ${assignment.curriculumPublisher}`
                : "Curriculum not selected"}
            </p>
          </div>
          <StatusPill
            className="justify-self-start sm:justify-self-end"
            tone={assignment.status === "active" ? "information" : "neutral"}
          >
            {assignment.status === "active" ? "Active" : "Archived"}
          </StatusPill>
          {assignment.status === "active" ? (
            <>
              <div className="flex flex-wrap gap-xs">
                <Button kind="ghost" size="sm" onClick={archiving.onEdit}>
                  Edit
                </Button>
                {archiving.armed ? (
                  <>
                    <Button
                      kind="danger--ghost"
                      size="sm"
                      disabled={archiving.pending}
                      onClick={archiving.onConfirm}
                    >
                      Confirm archive
                    </Button>
                    <Button kind="ghost" size="sm" onClick={archiving.onCancel}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button kind="ghost" size="sm" onClick={archiving.onArm}>
                    Archive
                  </Button>
                )}
              </div>
              <div className="col-span-full border-t border-rule pt-md">{curriculumPicker}</div>
            </>
          ) : null}
        </>
      )}
    </article>
  );
}
