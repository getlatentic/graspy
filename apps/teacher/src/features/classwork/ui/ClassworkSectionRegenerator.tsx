import { Button, InlineLoading, InlineNotification, TextArea } from "@carbon/react";

import { StatusPill } from "../../../ui/StatusPill";
import { useRef, useState } from "react";

import type {
  ClassworkSection,
  ClassworkSectionHistory,
  ClassworkWorkspaceSnapshot,
} from "../domain/classwork";
import { ClassworkText } from "./ClassworkText";

interface Props {
  readonly section: ClassworkSection;
  readonly documentVersionNumber: number;
  readonly editable: boolean;
  readonly editingAnotherBlock: boolean;
  readonly regeneration: NonNullable<NonNullable<ClassworkWorkspaceSnapshot["run"]>["sectionRegeneration"]> | null;
  readonly onCancel: () => void;
  readonly onGetHistory: (sectionId: string) => Promise<ClassworkSectionHistory>;
  readonly onRecreate: (sectionId: string, expectedVersionNumber: number, teacherDirection: string | null) => Promise<void>;
  readonly onRestore: (sectionId: string, sourceVersionNumber: number, expectedVersionNumber: number) => Promise<void>;
}

type PanelState = "closed" | "direction";
type HistoryState =
  | { readonly status: "idle" | "loading"; readonly value: null; readonly message: null }
  | { readonly status: "ready"; readonly value: ClassworkSectionHistory; readonly message: null }
  | { readonly status: "failed"; readonly value: null; readonly message: string };

export function ClassworkSectionRegenerator({
  section,
  documentVersionNumber,
  editable,
  editingAnotherBlock,
  regeneration,
  onCancel,
  onGetHistory,
  onRecreate,
  onRestore,
}: Props) {
  const [panel, setPanel] = useState<PanelState>("closed");
  const [direction, setDirection] = useState(regeneration?.sectionId === section.id ? regeneration.teacherDirection ?? "" : "");
  const [history, setHistory] = useState<HistoryState>({ status: "idle", value: null, message: null });
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const isThisSection = regeneration?.sectionId === section.id;
  const generating = isThisSection && regeneration?.status === "generating";
  const failed = isThisSection && regeneration?.status === "failed";
  const anotherSectionGenerating = Boolean(regeneration?.status === "generating" && !isThisSection);
  const actionsDisabled = !editable || editingAnotherBlock || anotherSectionGenerating;

  async function openHistory() {
    historyDialog.current?.showModal();
    setHistory({ status: "loading", value: null, message: null });
    try {
      setHistory({ status: "ready", value: await onGetHistory(section.id), message: null });
    } catch (error) {
      setHistory({
        status: "failed",
        value: null,
        message: error instanceof Error ? error.message : "The section history could not be opened. Try again.",
      });
    }
  }

  async function restore(versionNumber: number) {
    setRestoringVersion(versionNumber);
    try {
      await onRestore(section.id, versionNumber, documentVersionNumber);
      historyDialog.current?.close();
      setHistory({ status: "idle", value: null, message: null });
    } catch (error) {
      setHistory({
        status: "failed",
        value: null,
        message: error instanceof Error ? error.message : "That section version was not restored. Reopen the lesson and try again.",
      });
    } finally {
      setRestoringVersion(null);
    }
  }

  return (
    <div className="grid min-w-0 gap-sm print:hidden [&_.cds--text-area]:min-h-[7rem] [&_.cds--text-area]:resize-y [&_.cds--text-area]:[border-width:1px] [&_.cds--text-area]:bg-paper [&_.cds--text-area]:text-ink [&_.cds--text-area:focus]:outline-2 [&_.cds--text-area:focus]:outline-focus [&_.cds--text-area:focus]:outline-offset-2" data-state={generating ? "loading" : failed ? "error" : section.regenerated ? "success" : "default"}>
      <div className="flex min-w-0 flex-wrap items-center gap-xs [&_.cds--btn]:whitespace-nowrap">
        {section.regenerated ? <StatusPill size="sm" tone="information">Recreated</StatusPill> : null}
        {editable ? (
          <Button
            kind="ghost"
            size="sm"
            disabled={actionsDisabled || generating}
            onClick={() => setPanel((current) => current === "closed" ? "direction" : "closed")}
          >
            Recreate section
          </Button>
        ) : null}
        <Button kind="ghost" size="sm" disabled={generating} onClick={() => void openHistory()}>
          Version history
        </Button>
      </div>

      {panel === "direction" && !generating ? (
        <form className="grid min-w-0 gap-md border-t border-rule pt-md" onSubmit={(event) => {
          event.preventDefault();
          setPanel("closed");
          void onRecreate(section.id, documentVersionNumber, direction.trim() || null);
        }}>
          <div>
            <h3 className="m-0 font-body text-base font-extrabold text-ink">Recreate this section</h3>
            <p className="m-0 max-w-[65ch] text-ink-secondary">The current draft stays in place until the replacement passes every quality check.</p>
          </div>
          <TextArea
            id={`section-direction-${section.id}`}
            labelText="What should change? (optional)"
            helperText="For example: use smaller numbers and explain the check more slowly."
            maxCount={1_000}
            enableCounter
            value={direction}
            onChange={(event) => setDirection(event.currentTarget.value)}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-xs [&_.cds--btn]:whitespace-nowrap">
            <Button type="button" kind="secondary" onClick={() => setPanel("closed")}>Cancel</Button>
            <Button type="submit">Recreate section</Button>
          </div>
        </form>
      ) : null}

      {generating ? (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-md border-t border-accent pt-md sm:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1fr)_auto] sm:items-center [&_.cds--btn]:whitespace-nowrap [&_p]:m-0 [&_p]:max-w-[65ch] [&_p]:text-ink-secondary" role="status">
          <InlineLoading status="active" description="Recreating this section" />
          <p>Your current wording remains available while the replacement is checked.</p>
          <Button kind="tertiary" size="sm" onClick={onCancel}>Stop</Button>
        </div>
      ) : null}

      {failed ? (
        <div className="grid min-w-0 gap-md border-t border-rule pt-md [&_.cds--inline-notification]:m-0">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="This section was not recreated"
            subtitle={`${regeneration.lastError ?? "The replacement did not pass its checks."} Your current draft was not changed.`}
          />
          <Button kind="tertiary" size="sm" onClick={() => setPanel("direction")}>Change direction</Button>
        </div>
      ) : null}

      <dialog
        ref={historyDialog}
        className="section-history-dialog fixed inset-0 m-auto max-h-[min(86dvh,52rem)] w-[min(calc(100%-2rem),58rem)] max-w-[58rem] overflow-auto border border-rule-strong bg-paper p-0 text-ink backdrop:bg-backdrop print:hidden [&_.cds--btn]:whitespace-nowrap [&>.cds--inline-loading]:m-lg [&>.cds--inline-notification]:m-lg"
        onClose={() => setRestoringVersion(null)}
        onClick={(event) => {
          if (event.target === historyDialog.current) historyDialog.current?.close();
        }}
      >
        <div className="flex items-start justify-between gap-md border-b border-rule-strong p-lg">
          <div>
            <p className="m-0 text-ink-secondary">{section.title}</p>
            <h2 className="m-0 mt-2xs font-display text-lg font-extrabold tracking-[-0.025em]">Section version history</h2>
          </div>
          <Button kind="ghost" size="sm" onClick={() => historyDialog.current?.close()}>Close</Button>
        </div>
        {history.status === "loading" ? <InlineLoading status="active" description="Opening section history" /> : null}
        {history.status === "failed" ? (
          <InlineNotification kind="error" lowContrast hideCloseButton title="History not opened" subtitle={history.message} />
        ) : null}
        {history.status === "ready" ? (
          <ol className="m-0 grid list-none p-0 [&_h3]:m-0 [&_h3]:font-body [&_h3]:text-md [&_h3]:font-extrabold [&_h3]:[overflow-wrap:anywhere] [&_h4]:m-0 [&_p]:m-0 [&_summary]:min-h-[2.75rem] [&_summary]:cursor-pointer [&_summary]:py-sm [&_summary]:font-extrabold [&_summary]:text-accent [@media(hover:hover)_and_(pointer:fine)]:[&_summary]:hover:text-accent-hover [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-focus [&_summary]:focus-visible:outline-offset-2 [&>li]:grid [&>li]:gap-md [&>li]:border-b [&>li]:border-rule [&>li]:p-lg [&>li>header]:flex [&>li>header]:min-w-0 [&>li>header]:items-start [&>li>header]:justify-between [&>li>header]:gap-md">
            {history.value.versions.map((version) => {
              const current = version.versionNumber === history.value.currentVersionNumber;
              return (
                <li key={version.versionNumber}>
                  <header>
                    <div>
                      <p>Draft {version.versionNumber}{current ? " · Current" : ""}</p>
                      <h3>{version.title}</h3>
                    </div>
                    {version.regenerated ? <StatusPill size="sm" tone="information">Recreated</StatusPill> : null}
                  </header>
                  {version.teacherDirection ? <p><b>Direction:</b> {version.teacherDirection}</p> : null}
                  {version.restoredFromVersionNumber ? <p>Restored from draft {version.restoredFromVersionNumber}.</p> : null}
                  <details>
                    <summary>Review this version</summary>
                    <div className="grid gap-md border-t border-rule pt-md [&_section]:grid [&_section]:gap-xs">
                      {version.blocks.map((block) => (
                        <section key={block.id}>
                          <h4>{blockLabel(block.kind)}</h4>
                          <ClassworkText text={block.text} />
                        </section>
                      ))}
                    </div>
                  </details>
                  {!current && editable ? (
                    <Button
                      kind="tertiary"
                      size="sm"
                      disabled={restoringVersion !== null}
                      onClick={() => void restore(version.versionNumber)}
                    >
                      {restoringVersion === version.versionNumber ? "Restoring section" : "Restore this section"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </dialog>
    </div>
  );
}

function blockLabel(kind: ClassworkSection["blocks"][number]["kind"]): string {
  return { review: "Review", worked_example: "Worked example", practice: "Practice", solution: "Solution" }[kind];
}
