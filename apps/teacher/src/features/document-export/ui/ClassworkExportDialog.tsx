import {
  Button,
  InlineLoading,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
} from "@carbon/react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { ClassworkExportGateway } from "../application/ClassworkExportGateway";
import {
  exportCopySchema,
  type ExportCopy,
  type ExportClassworkSet,
  type ExportClassworkTarget,
  type PreparedClassworkExport,
} from "../domain/documentExport";

interface Props {
  readonly context: LessonContextRequest;
  readonly gateway: ClassworkExportGateway;
  readonly lessonId: string;
  readonly classworkSet: ExportClassworkSet;
  readonly targets?: readonly ExportClassworkTarget[];
  readonly initialTargetId?: string;
  /** Which copy the teacher asked for, so a follow-up opens on what they meant. */
  readonly initialCopy?: ExportCopy;
  readonly label?: string;
}

type Operation =
  | { readonly status: "idle" }
  | { readonly status: "preparing" }
  | { readonly status: "ready"; readonly document: PreparedClassworkExport }
  | { readonly status: "saving"; readonly document: PreparedClassworkExport }
  | { readonly status: "printing"; readonly document: PreparedClassworkExport }
  | { readonly status: "saved"; readonly document: PreparedClassworkExport; readonly path: string }
  | { readonly status: "failed"; readonly document: PreparedClassworkExport | null; readonly message: string };

export function ClassworkExportDialog({ context, gateway, lessonId, classworkSet, targets = [], initialTargetId, initialCopy = "student", label = "Export and print" }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLIFrameElement>(null);
  const preparationSequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<ExportCopy>(initialCopy);
  const [targetId, setTargetId] = useState(initialTargetId ?? targets[0]?.id ?? "");
  const [operation, setOperation] = useState<Operation>({ status: "idle" });
  const [previewReady, setPreviewReady] = useState(false);
  const request = useMemo(() => ({
    context,
    lessonId,
    classworkSet,
    groupId: classworkSet === "group" ? targetId || null : null,
    copy,
  }), [context, copy, lessonId, classworkSet, targetId]);
  const available = classworkSet === "original" || Boolean(targetId);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const sequence = ++preparationSequence.current;
    setPreviewReady(false);
    setOperation({ status: "preparing" });
    void gateway.prepare(request).then(
      (document) => {
        if (preparationSequence.current === sequence) setOperation({ status: "ready", document });
      },
      (error: unknown) => {
        if (preparationSequence.current === sequence) {
          setOperation({ status: "failed", document: null, message: errorMessage(error, "The lesson document could not be prepared.") });
        }
      },
    );
  }, [gateway, open, request]);

  useEffect(() => {
    function receivePreviewState(event: MessageEvent) {
      if (event.source !== preview.current?.contentWindow) return;
      if (event.data === "graspy:export-ready") setPreviewReady(true);
      if (event.data === "graspy:export-failed") {
        setOperation((current) => ({
          status: "failed",
          document: "document" in current ? current.document : null,
          message: "The mathematics or fonts in this document could not be prepared.",
        }));
      }
    }
    window.addEventListener("message", receivePreviewState);
    return () => window.removeEventListener("message", receivePreviewState);
  }, []);

  function close() {
    preparationSequence.current += 1;
    dialog.current?.close();
    setOpen(false);
    setOperation({ status: "idle" });
  }

  async function savePdf(document: PreparedClassworkExport) {
    setOperation({ status: "saving", document });
    try {
      const destinationPath = await gateway.choosePdfDestination(document.fileName);
      if (!destinationPath) {
        setOperation({ status: "ready", document });
        return;
      }
      const artifact = await gateway.savePdf({ document: request, destinationPath });
      setOperation({ status: "saved", document, path: artifact.path });
    } catch (error) {
      setOperation({ status: "failed", document, message: errorMessage(error, "The PDF could not be saved.") });
    }
  }

  async function printDocument(document: PreparedClassworkExport) {
    setOperation({ status: "printing", document });
    try {
      await gateway.print(request);
      setOperation({ status: "ready", document });
    } catch (error) {
      setOperation({ status: "failed", document, message: errorMessage(error, "The print window could not be opened.") });
    }
  }

  const document = "document" in operation ? operation.document : null;
  const busy = operation.status === "preparing" || operation.status === "saving" || operation.status === "printing";

  return (
    <>
      <Button disabled={!available} onClick={() => setOpen(true)}>{label}</Button>
      <dialog
        ref={dialog}
        className="m-auto [@media(hover:hover)_and_(pointer:fine)]:[&_.cds--btn:hover]:no-underline h-[min(52rem,calc(100dvh-2rem))] max-h-none w-[min(72rem,calc(100%-2rem))] max-w-none border border-rule-strong bg-paper p-0 text-ink backdrop:bg-backdrop [@media(pointer:coarse)]:[&_.cds--btn]:min-h-[3rem]"
        aria-labelledby="classwork-export-title"
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClose={() => { setOpen(false); setOperation({ status: "idle" }); }}
      >
        <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] min-[48rem]:grid-cols-[19rem_minmax(0,1fr)] min-[48rem]:grid-rows-[auto_minmax(0,1fr)] [&>header]:flex [&>header]:min-w-0 [&>header]:items-center [&>header]:justify-between [&>header]:gap-md [&>header]:border-b [&>header]:border-rule [&>header]:p-md min-[48rem]:[&>header]:col-span-full [&>header_.cds--btn]:whitespace-nowrap">
          <header>
            <div>
              <h2 className="m-0 min-w-0 text-lg leading-display [overflow-wrap:anywhere]" id="classwork-export-title">Prepare lesson copies</h2>
              <p className="m-0 mt-2xs max-w-[62ch] leading-body text-ink-secondary">Check the paper version, then print it or save a PDF.</p>
            </div>
            <Button kind="ghost" size="sm" disabled={busy} onClick={close}>Close</Button>
          </header>

          <aside className="grid min-w-0 content-start gap-md border-b border-rule bg-paper-soft p-md min-[48rem]:border-b-0 min-[48rem]:border-e [&_.cds--radio-button-group]:gap-sm [&>p]:m-0 [&>p]:mt-2xs [&>p]:max-w-[62ch] [&>p]:leading-body [&>p]:text-ink-secondary" aria-label="Copy settings">
            {classworkSet === "group" && targets.length > 1 ? (
              <Select id="export-group" labelText="Teaching group" value={targetId} disabled={busy} onChange={(event) => setTargetId(event.target.value)}>
                {targets.map((target) => <SelectItem key={target.id} value={target.id} text={target.name} />)}
              </Select>
            ) : null}
            <RadioButtonGroup
              legendText="Copy for"
              name="export-copy"
              valueSelected={copy}
              orientation="vertical"
              onChange={(value) => setCopy(exportCopySchema.parse(value))}
            >
              <RadioButton id="export-student-copy" labelText="Students" value="student" disabled={busy} />
              <RadioButton id="export-teacher-copy" labelText="Teacher, with answers" value="teacher" disabled={busy} />
            </RadioButtonGroup>
            <p>{copy === "student" ? "Answers and teacher notes are left out." : "Includes answers and how each activity connects to the lesson."}</p>
            <div className="flex flex-wrap items-center gap-sm [&_.cds--btn]:whitespace-nowrap">
              <Button kind="secondary" disabled={!document || !previewReady || busy} onClick={() => document && void printDocument(document)}>Print</Button>
              <Button disabled={!document || busy} onClick={() => document && void savePdf(document)}>Save PDF</Button>
            </div>
            {operation.status === "saving" ? <InlineLoading description="Saving the PDF" status="active" /> : null}
            {operation.status === "printing" ? <InlineLoading description="Opening print" status="active" /> : null}
            {operation.status === "saved" ? (
              <InlineNotification kind="success" lowContrast hideCloseButton title="PDF saved" subtitle={operation.path} />
            ) : null}
            {operation.status === "failed" ? (
              <InlineNotification kind="error" lowContrast hideCloseButton title="Document not ready" subtitle={operation.message} />
            ) : null}
          </aside>

          <section className="grid min-h-0 min-w-0 place-items-stretch overflow-hidden bg-canvas [&>.cds--inline-loading]:self-center [&>.cds--inline-loading]:justify-self-center [&_iframe]:h-full [&_iframe]:min-h-[18rem] [&_iframe]:w-full [&_iframe]:border-0 [&_iframe]:bg-paper" aria-label="Paper preview">
            {operation.status === "preparing" ? <InlineLoading description="Preparing the paper preview" status="active" /> : null}
            {document ? (
              <iframe
                ref={preview}
                title={`${document.title} paper preview`}
                srcDoc={document.html}
                referrerPolicy="no-referrer"
              />
            ) : null}
          </section>
        </div>
      </dialog>
    </>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
