import { type ReactNode, useId, useState } from "react";
import { Button, InlineLoading, InlineNotification } from "@carbon/react";

import type { StudentNote } from "../domain/studentNote";

/**
 * The two documents one prepared lesson carries — the plan a head of department
 * signs, and the note pupils copy — with a single export for approval.
 *
 * Both behind one header so a lesson is one thing seen two ways rather than two
 * screens to hunt between. The plan is always here; the note is written from it,
 * so it stands on its own empty state until the teacher asks for it.
 *
 * The lesson's classwork are not a third tab. They are the worked examples and
 * practice a teacher takes into the room, made on their own screen, and reached
 * from the lesson's actions where the progress strip already names them.
 */
export type LessonArtifact = "plan" | "note";

const ARTIFACTS: readonly { readonly id: LessonArtifact; readonly label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "note", label: "Note" },
];

const panelHeading = "m-0 text-base text-ink";
/**
 * A word a teacher taps, sized like one: a bare label has no box of its own,
 * so the target is stated, and held on a narrow screen rather than squeezed
 * under the width the word needs.
 */
const inlineLink =
  "inline-flex min-h-[2.75rem] min-w-[2.75rem] flex-none cursor-pointer items-center justify-center whitespace-nowrap border-0 bg-transparent p-0 text-sm text-accent disabled:cursor-not-allowed disabled:text-muted";
/** The label sits on the rule; the target grows upward, out of the way. */
const artifactTab =
  "relative inline-flex min-h-[2.75rem] min-w-[2.75rem] cursor-pointer items-end justify-center border-0 bg-transparent px-[4px] pb-[14px] font-semibold text-ink-secondary hover:text-ink aria-selected:text-ink aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:-bottom-px aria-selected:after:h-[2px] aria-selected:after:bg-accent aria-selected:after:content-['']";
/** Kept whole: on a narrow screen it takes the line under the rail, not a clipping. */
const exportAction =
  "mb-[0.5rem] ms-auto inline-flex min-h-[2.75rem] flex-none cursor-pointer items-center gap-2xs rounded-[12px] border-[1.5px] border-accent-soft bg-transparent px-sm text-sm font-semibold text-accent hover:border-accent hover:bg-paper-accent";
const emptyState =
  "grid justify-items-center gap-md py-2xl text-center";
const working = "grid justify-items-center py-2xl";
const artifactHead = "flex items-start justify-between gap-md";

/** Where a saved plan went, or why it did not go. */
export type PlanExportOutcome =
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly path: string }
  | { readonly kind: "failed"; readonly message: string };

export function LessonArtifactTabs({
  note,
  onExport,
  exportOutcome,
  openAt,
  plan,
}: {
  readonly note: StudentNotePanelProps;
  readonly onExport: (() => void) | null;
  /**
   * What became of the last export. A PDF was written to the teacher's disk and
   * nothing on screen said so, or where — which for a teacher whose next step is
   * to get it onto paper or a phone is the only part that matters.
   */
  readonly exportOutcome: PlanExportOutcome | null;
  /** The artifact to show first, when a teacher arrives from work on one of them. */
  readonly openAt?: LessonArtifact | null;
  readonly plan: ReactNode;
}) {
  const [active, setActive] = useState<LessonArtifact>(openAt ?? "plan");
  const base = useId();
  return (
    <div className="grid gap-lg">
      <div className="flex flex-wrap items-end gap-x-md gap-y-sm">
        <div
          className="flex grow gap-lg border-b border-rule"
          role="tablist"
          aria-label="Lesson views"
        >
          {ARTIFACTS.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              role="tab"
              id={`${base}-tab-${artifact.id}`}
              aria-selected={active === artifact.id}
              aria-controls={`${base}-panel-${artifact.id}`}
              className={artifactTab}
              onClick={() => setActive(artifact.id)}
            >
              {artifact.label}
            </button>
          ))}
        </div>
        {onExport ? (
          <button type="button" className={exportAction} onClick={onExport}>
            <svg viewBox="0 0 32 32" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M26 24v4H6v-4H4v4a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-4zM26 14l-1.41-1.41L17 20.17V2h-2v18.17l-7.59-7.58L6 14l10 10 10-10z" />
            </svg>
            Save a PDF to sign
          </button>
        ) : null}
      </div>
      {exportOutcome ? (
        <p className="m-0 text-sm text-ink-secondary" aria-live="polite">
          {exportOutcome.kind === "saving" ? "Saving the PDF…" : null}
          {exportOutcome.kind === "saved" ? (
            <>
              Saved to <span className="text-ink [overflow-wrap:anywhere]">{exportOutcome.path}</span>
            </>
          ) : null}
          {exportOutcome.kind === "failed" ? (
            <span className="text-danger">Not saved. {exportOutcome.message}</span>
          ) : null}
        </p>
      ) : null}
      <div
        role="tabpanel"
        id={`${base}-panel-${active}`}
        aria-labelledby={`${base}-tab-${active}`}
        className="grid gap-xl"
      >
        {active === "plan" ? plan : null}
        {active === "note" ? <StudentNotePanel {...note} /> : null}
      </div>
    </div>
  );
}

export interface StudentNotePanelProps {
  readonly note: StudentNote | null;
  readonly hasPlan: boolean;
  readonly generating: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly onGenerate: () => void;
}

/** The note pupils copy and read, written from the finished plan. */
function StudentNotePanel({ note, hasPlan, generating, error, stale, onGenerate }: StudentNotePanelProps) {
  if (generating) {
    return (
      <div className={working} aria-live="polite">
        <InlineLoading description="Writing the student note from your plan" status="active" />
      </div>
    );
  }
  if (note) {
    return (
      <section className="grid gap-lg">
        <div className={artifactHead}>
          <div>
            <h3 className={panelHeading}>Student note</h3>
            <p className="m-0 mt-2xs text-sm text-ink-secondary">
              The note pupils copy and read — written from your plan.
            </p>
          </div>
          <button type="button" className={inlineLink} onClick={onGenerate} disabled={!hasPlan}>
            Regenerate
          </button>
        </div>
        {stale ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Written from an earlier version of this lesson"
            subtitle="Regenerate it to match your current plan."
          />
        ) : null}
        {error ? <InlineNotification kind="error" lowContrast hideCloseButton title="Note not updated" subtitle={error} /> : null}
        <div className="grid gap-sm">
          {note.paragraphs.map((paragraph, index) => (
            <p key={index} className="m-0 leading-[1.65] text-ink-secondary">
              {paragraph}
            </p>
          ))}
        </div>
      </section>
    );
  }
  return (
    <div className={emptyState}>
      <div className="text-lg font-semibold text-ink">No student note yet</div>
      <p className="m-0 max-w-[26rem] text-ink-secondary">
        {hasPlan
          ? "The student note is written from your lesson plan. Generate it, then edit anything you want pupils to read."
          : "The student note is written from your finished lesson plan. Draft the plan first, then generate the note."}
      </p>
      {error ? <InlineNotification kind="error" lowContrast hideCloseButton title="Note not written" subtitle={error} /> : null}
      <Button size="md" onClick={onGenerate} disabled={!hasPlan}>
        Generate from plan
      </Button>
    </div>
  );
}
