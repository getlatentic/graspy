import { Button, InlineLoading, InlineNotification } from "@carbon/react";

import { StatusPill } from "../../../ui/StatusPill";
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";

import type { ClassworkGateway } from "../application/ClassworkGateway";
import {
  buildClassworkDocument,
  type ClassworkDocumentBlock,
  type ClassworkTraceabilityRow,
} from "../domain/classworkDocument";
import type { ClassworkSection, ClassworkSectionHistory, ClassworkSourceSummary, ClassworkWorkspaceSnapshot } from "../domain/classwork";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import { ClassworkFigure } from "./ClassworkFigure";
import { ClassworkSectionRegenerator } from "./ClassworkSectionRegenerator";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import { ClassworkExportDialog } from "../../document-export/ui/ClassworkExportDialog";

const ClassworkText = lazy(() => import("./ClassworkText").then(({ ClassworkText: component }) => ({ default: component })));
const ClassworkBlockEditor = lazy(() => import("./ClassworkBlockEditor").then(({ ClassworkBlockEditor: component }) => ({ default: component })));
const qualityLabels = {
  passed: { label: "Quality checked", tone: "positive" },
  repaired: { label: "Improved automatically", tone: "information" },
  scrubbed: { label: "Source wording adjusted", tone: "information" },
  failed: { label: "Needs attention", tone: "attention" },
} as const;

interface Props {
  readonly context: LessonContextRequest;
  readonly gateway: ClassworkGateway;
  readonly lessonId: string;
  readonly snapshot: ClassworkWorkspaceSnapshot;
  readonly exportGateway?: ClassworkExportGateway;
  readonly onApprove: (expectedVersionNumber: number) => Promise<void>;
  readonly onEditBlock: (blockId: string, expectedVersionNumber: number, text: string) => Promise<void>;
  readonly onCancelRegeneration: () => void;
  readonly onGetSectionHistory: (sectionId: string) => Promise<ClassworkSectionHistory>;
  readonly onRecreateSection: (sectionId: string, expectedVersionNumber: number, teacherDirection: string | null) => Promise<void>;
  readonly onRestoreSection: (sectionId: string, sourceVersionNumber: number, expectedVersionNumber: number) => Promise<void>;
}

export function ClassworkDocument({ context, gateway, lessonId, snapshot, exportGateway, onApprove, onEditBlock, onCancelRegeneration, onGetSectionHistory, onRecreateSection, onRestoreSection }: Props) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  let document;
  try {
    document = buildClassworkDocument(snapshot);
  } catch (error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Saved classwork needs attention"
        subtitle={error instanceof Error ? error.message : "The saved document could not be prepared."}
      />
    );
  }
  if (!document) return null;
  const sourcesByKey = new Map(document.citedSources.map((source) => [source.key, source]));
  const documentVersion = snapshot.run?.documentVersion;
  const editable = snapshot.run?.status === "complete" && documentVersion?.status === "draft";
  const regeneration = snapshot.run?.sectionRegeneration ?? null;
  const recreationInProgress = regeneration?.status === "generating";
  const blockEditingAllowed = editable && !recreationInProgress;

  return (
    <article className="grid min-w-0 gap-3xl print:m-0 print:block print:min-h-0 print:w-full print:border-0 print:p-0 print:bg-paper print:text-ink" aria-label="Classwork document">
      {documentVersion ? (
        <DocumentReviewBar
          version={documentVersion}
          onApprove={onApprove}
          recreationInProgress={recreationInProgress}
          exportAction={documentVersion.status === "approved" && exportGateway ? (
            <ClassworkExportDialog context={context} gateway={exportGateway} lessonId={lessonId} classworkSet="original" />
          ) : null}
        />
      ) : null}
      {document.sections.map(({ section, blocks }) => (
        <ClassworkSection
          key={section.id}
          section={section}
          blocks={blocks}
          figures={{ context, gateway, lessonId, sourcesByKey }}
          editing={{
            allowed: blockEditingAllowed,
            openBlockId: editingBlockId,
            documentVersionNumber: documentVersion?.versionNumber ?? null,
            onBegin: setEditingBlockId,
            onCancel: () => setEditingBlockId(null),
            onSave: async (blockId, versionNumber, text) => {
              await onEditBlock(blockId, versionNumber, text);
              setEditingBlockId(null);
            },
          }}
          recreate={
            documentVersion ? (
              <ClassworkSectionRegenerator
                section={section}
                documentVersionNumber={documentVersion.versionNumber}
                editable={blockEditingAllowed}
                editingAnotherBlock={editingBlockId !== null}
                regeneration={regeneration}
                onCancel={onCancelRegeneration}
                onGetHistory={onGetSectionHistory}
                onRecreate={onRecreateSection}
                onRestore={onRestoreSection}
              />
            ) : null
          }
        />
      ))}
      <TraceabilityTable rows={document.traceability} />
      <SourceNotes sources={document.citedSources} />
    </article>
  );
}

/** What a figure needs to fetch and attribute itself. */
export interface FigureAccess {
  readonly context: LessonContextRequest;
  readonly gateway: ClassworkGateway;
  readonly lessonId: string;
  readonly sourcesByKey: ReadonlyMap<string, ClassworkSourceSummary>;
}

/** Editing one block of a section: whether it is allowed, which is open, and how to save. */
export interface BlockEditing {
  readonly allowed: boolean;
  readonly openBlockId: string | null;
  /** The draft a save is written against; `null` while there is no draft to edit. */
  readonly documentVersionNumber: number | null;
  readonly onBegin: (blockId: string) => void;
  readonly onCancel: () => void;
  readonly onSave: (blockId: string, versionNumber: number, text: string) => Promise<void>;
}

interface SectionProps {
  readonly section: ClassworkSection;
  readonly blocks: ClassworkDocumentBlock[];
  readonly figures: FigureAccess;
  readonly editing: BlockEditing;
  /** Recreating this section, composed by whoever owns the run it belongs to. */
  readonly recreate: ReactNode;
}

function ClassworkSection({ section, blocks, figures, editing, recreate }: SectionProps) {
  const { context, gateway, lessonId, sourcesByKey } = figures;
  return (
    <section className="grid w-[min(100%,70ch)] min-w-0 gap-0 print:w-full print:max-w-none" aria-labelledby={`classwork-section-${section.id}`}>
      <header className="grid gap-xs border-b border-rule py-lg break-after-avoid">
        <p className="m-0 text-sm font-bold text-ink-secondary">Lesson step {section.sequence}</p>
        <h2 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere] text-xl leading-display" id={`classwork-section-${section.id}`}>{section.title}</h2>
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className="m-0 leading-body text-ink-secondary">Learning goals {section.learningGoalNumbers.join(", ")}</p>
          {section.quality ? (
            <StatusPill size="sm" tone={qualityLabels[section.quality.outcome].tone}>
              {qualityLabels[section.quality.outcome].label}
            </StatusPill>
          ) : null}
        </div>
        {recreate}
      </header>
      <Suspense fallback={<InlineLoading description="Opening saved section" status="active" />}>
        {blocks.map(({ block, label, figuresAfter }) => (
          <div className="grid min-w-0" key={block.id}>
            <ClassworkBlock
              block={block}
              label={label}
              editable={editing.allowed}
              editing={editing.openBlockId === block.id}
              anotherBlockEditing={editing.openBlockId !== null && editing.openBlockId !== block.id}
              onBeginEdit={() => editing.onBegin(block.id)}
              onCancelEdit={editing.onCancel}
              onSave={async (text) => {
                if (editing.documentVersionNumber === null) {
                  throw new Error("The lesson draft is not ready to edit.");
                }
                await editing.onSave(block.id, editing.documentVersionNumber, text);
              }}
            />
            {figuresAfter.map((figure) => {
              const source = sourcesByKey.get(figure.sourceMaterialKey);
              return (
                <ClassworkFigure
                  key={figure.id}
                  context={context}
                  figure={figure}
                  gateway={gateway}
                  lessonId={lessonId}
                  sourceName={source ? `${source.title} — ${source.publisher}` : "Confirmed lesson source"}
                />
              );
            })}
          </div>
        ))}
      </Suspense>
    </section>
  );
}

interface ClassworkBlockProps {
  readonly block: ClassworkSection["blocks"][number];
  readonly label: string;
  readonly editable: boolean;
  readonly editing: boolean;
  readonly anotherBlockEditing: boolean;
  readonly onBeginEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onSave: (text: string) => Promise<void>;
}

function ClassworkBlock({ block, label, editable, editing, anotherBlockEditing, onBeginEdit, onCancelEdit, onSave }: ClassworkBlockProps) {
  return (
    <section
      className={`min-w-0 border-b border-rule py-xl break-inside-avoid data-[teacher-edited=true]:bg-paper-accent ${
        block.kind === "worked_example" || block.kind === "solution" ? "bg-paper-soft px-md text-ink sm:px-lg" : ""
      } ${block.kind === "practice" ? "border-b-rule-strong" : ""}`}
      data-teacher-edited={block.teacherEdited || undefined}
    >
      <header className="mb-md flex min-w-0 flex-wrap items-start justify-between gap-sm break-after-avoid [&_.cds--btn]:flex-none [&_.cds--btn]:whitespace-nowrap print:[&_.cds--btn]:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-sm">
          <h3 className="m-0 font-body text-base font-extrabold not-italic text-accent">{label}</h3>
          {block.teacherEdited ? <StatusPill size="sm" tone="information">Edited by you</StatusPill> : null}
        </div>
        {editable && !editing ? (
          <Button kind="ghost" size="sm" disabled={anotherBlockEditing} onClick={onBeginEdit}>
            Edit {label.toLocaleLowerCase()}
          </Button>
        ) : null}
      </header>
      {editing ? (
        <Suspense fallback={<InlineLoading description={`Opening ${label.toLocaleLowerCase()} editor`} status="active" />}>
          <ClassworkBlockEditor label={label} text={block.text} onCancel={onCancelEdit} onSave={onSave} />
        </Suspense>
      ) : (
        <ClassworkText text={block.text} />
      )}
    </section>
  );
}

const traceCell =
  "block px-0 py-xs text-start align-top font-normal leading-body text-ink-secondary [overflow-wrap:anywhere] before:mb-2xs before:block before:text-sm before:font-extrabold before:text-ink before:content-[attr(data-label)] sm:table-cell sm:border-b sm:border-rule sm:p-md sm:before:hidden";

function TraceabilityTable({ rows }: { readonly rows: readonly ClassworkTraceabilityRow[] }) {
  return (
    <section className="grid min-w-0 gap-lg print:break-before-page [&_cite]:not-italic" aria-labelledby="classwork-traceability-title">
      <header className="grid max-w-[65ch] gap-xs">
        <h2 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere] text-lg" id="classwork-traceability-title">How each activity connects</h2>
        <p className="m-0 leading-body text-ink-secondary">Every activity is tied to the confirmed lesson goal and the published source material used to create it.</p>
      </header>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Learning-goal and source connections for each classwork activity</caption>
        <thead className="hidden sm:table-header-group sm:[&_th]:text-sm sm:[&_th]:font-extrabold sm:[&_th]:text-ink"><tr><th scope="col">Activity</th><th scope="col">Learning goal</th><th scope="col">Published source</th><th scope="col">Review status</th></tr></thead>
        <tbody className="block sm:table-row-group">
          {rows.map((row) => (
            <tr className="block border-t border-rule py-md break-inside-avoid sm:table-row sm:py-0" key={row.item}>
              <th className={traceCell} scope="row" data-label="Activity">{row.item}</th>
              <td className={traceCell} data-label="Learning goal">{row.learningGoals.join(" ")}</td>
              <td className={traceCell} data-label="Published source">{row.sources.map(({ key, publisher, title }) => <cite className="block" key={key}>{title} — {publisher}</cite>)}</td>
              <td className={traceCell} data-label="Review status">{row.teacherEdited ? "Edited by you" : "Original wording"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DocumentReviewBar({ version, onApprove, recreationInProgress, exportAction }: {
  readonly version: NonNullable<NonNullable<ClassworkWorkspaceSnapshot["run"]>["documentVersion"]>;
  readonly onApprove: (expectedVersionNumber: number) => Promise<void>;
  readonly recreationInProgress: boolean;
  readonly exportAction: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"idle" | "approving" | "failed">("idle");
  const [message, setMessage] = useState("");
  const approved = version.status === "approved";

  async function approve() {
    setState("approving");
    try {
      await onApprove(version.versionNumber);
      dialog.current?.close();
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error && error.message.trim() ? error.message : "This draft was not approved. Reopen the lesson and try again.");
      setState("failed");
    }
  }

  return (
    <section className="grid min-w-0 gap-lg border-y border-rule-strong py-lg sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&_.cds--btn]:self-start [&_.cds--btn]:whitespace-nowrap print:hidden" aria-labelledby="classwork-review-title">
      <div className="grid min-w-0 gap-xs [&>p]:m-0 [&>p]:max-w-[65ch] [&>p]:leading-body [&>p]:text-ink-secondary [&>p:first-child]:text-sm [&>p:first-child]:font-extrabold [&>p:first-child]:tabular-nums [&>p:first-child]:text-accent">
        <p>{approved ? `Approved draft ${version.versionNumber}` : `Draft ${version.versionNumber}`}</p>
        <h2 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere]" id="classwork-review-title">{approved ? "Ready for export" : "Review your classwork"}</h2>
        <p id="classwork-review-guidance">{approved ? "This approved draft is read-only." : recreationInProgress ? "Finish or stop the section being recreated before approving this draft." : "Edit any activity, then approve the final wording when it is ready."}</p>
      </div>
      {approved ? <div className="flex flex-wrap items-center gap-sm"><StatusPill tone="positive">Approved</StatusPill>{exportAction}</div> : (
        <Button disabled={recreationInProgress} aria-describedby="classwork-review-guidance" onClick={() => dialog.current?.showModal()}>Review and approve</Button>
      )}

      <dialog ref={dialog} className="fixed inset-0 m-auto max-h-[min(80dvh,40rem)] w-[min(calc(100%-2rem),36rem)] max-w-none border border-rule-strong bg-paper p-0 text-ink backdrop:bg-backdrop [&_.cds--btn]:whitespace-nowrap [&_form]:grid [&_form]:gap-lg [&_form]:p-lg [&_form>div:last-of-type]:flex [&_form>div:last-of-type]:flex-wrap [&_form>div:last-of-type]:gap-xs [&_form>p]:m-0 [&_form>p]:leading-body [&_form>p]:text-ink-secondary" onClose={() => setState("idle")}>
        <form method="dialog">
          <h2 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere]">Approve draft {version.versionNumber}?</h2>
          <p>Approval locks every activity in this draft. You will not be able to edit this approved version.</p>
          {state === "failed" ? (
            <InlineNotification kind="error" lowContrast hideCloseButton title="Draft not approved" subtitle={message} />
          ) : null}
          <div>
            <Button type="button" kind="secondary" disabled={state === "approving"} onClick={() => dialog.current?.close()}>Cancel</Button>
            <Button type="button" disabled={state === "approving"} onClick={() => void approve()}>Approve the classwork</Button>
          </div>
          {state === "approving" ? <InlineLoading description="Approving the classwork" status="active" /> : null}
        </form>
      </dialog>
    </section>
  );
}

function SourceNotes({ sources }: { readonly sources: ClassworkSourceSummary[] }) {
  return (
    <footer className="grid max-w-[70ch] gap-md print:w-full print:max-w-none [&_cite]:not-italic">
      <h2 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere] text-lg">Source notes</h2>
      <ol className="m-0 grid gap-sm ps-lg leading-body text-ink-secondary">
        {sources.map((source) => (
          <li key={source.key}>
            <cite>{source.title}</cite>, {source.publisher}. {source.licenceName}.
          </li>
        ))}
      </ol>
    </footer>
  );
}
