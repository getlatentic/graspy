import { Button, InlineNotification, TextArea } from "@carbon/react";

import type { ReactNode } from "react";

import type { BringingIn, ImportOutcome } from "./useBringingInAPlan";

/** Bringing a plan in from a file or a photograph, as the section sees it. */
export interface PlanBroughtIn {
  readonly bringingIn: BringingIn;
  readonly outcome: ImportOutcome;
  /** The page a photograph was read from, kept on screen for checking against. */
  readonly page: string | null;
  readonly importDocument: () => void;
  readonly readPhotograph: () => void;
  readonly stopReading: () => void;
}

/**
 * The teacher's own lesson plan, in their words.
 *
 * The text is kept exactly as written — a plan is judged against what the
 * teacher meant, so nothing structures it before they have read it back.
 *
 * A file and a photograph both land the words in this same box, because
 * bringing a plan in is a way of typing rather than a way of generating. A
 * photograph stays on screen beside them: about two written words in three
 * survive being read off a page, and a word cannot be corrected against a
 * source that is not there.
 */
export function PastedPlanFields({
  text,
  onTextChange,
  pending,
  bringingIn,
  offering,
  settingUpPhotographs,
}: {
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  /** An action is in flight, so the controls here stand down. */
  readonly pending: boolean;
  readonly bringingIn: PlanBroughtIn;
  /** Which ways in are wired, if any. */
  readonly offering: { readonly document: boolean; readonly photograph: boolean };
  /** Shown in place of the photograph button while there is nothing to read with. */
  readonly settingUpPhotographs: ReactNode;
}) {
  const busy = pending || bringingIn.bringingIn !== null;
  const reading = bringingIn.bringingIn === "photograph";
  return (
    <section className="grid min-w-0 gap-lg border-b border-rule pb-xl">
      <div>
        <h2 className="m-0 text-md text-ink">Original lesson plan</h2>
        <p className="m-0 mt-xs max-w-[65ch] leading-body text-ink-secondary">The text is stored unchanged so you can review it before confirmation.</p>
      </div>
      {offering.document || offering.photograph || settingUpPhotographs ? (
        <div className="grid justify-items-start gap-sm">
          <div className="flex flex-wrap gap-sm">
            {offering.document ? (
              <Button
                kind="tertiary"
                type="button"
                disabled={busy}
                onClick={bringingIn.importDocument}
              >
                {bringingIn.bringingIn === "document"
                  ? "Reading the file…"
                  : "Import from a Word file or PDF"}
              </Button>
            ) : null}
            {offering.photograph ? (
              <Button
                kind="tertiary"
                type="button"
                disabled={busy}
                onClick={bringingIn.readPhotograph}
              >
                {reading ? "Reading the page…" : "Read a photograph of the plan"}
              </Button>
            ) : null}
            {reading ? (
              <Button kind="ghost" type="button" onClick={bringingIn.stopReading}>
                Stop reading
              </Button>
            ) : null}
          </div>
          {offering.photograph ? null : settingUpPhotographs}
          {reading ? (
            <p className="m-0 text-sm leading-ui text-ink-secondary" role="status">
              Reading the page a few lines at a time. This takes about a minute.
            </p>
          ) : null}
          {bringingIn.outcome?.kind === "read" ? (
            <p className="m-0 text-sm leading-ui text-ink-secondary" role="status">
              Read from {bringingIn.outcome.fileName}. Check it below before building the lesson.
            </p>
          ) : null}
          {bringingIn.outcome?.kind === "failed" ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="That lesson plan was not read"
              subtitle={bringingIn.outcome.message}
            />
          ) : null}
        </div>
      ) : null}
      <div className={bringingIn.page ? "grid min-w-0 gap-lg lg:grid-cols-2" : "grid min-w-0"}>
        {bringingIn.page ? (
          <figure className="m-0 grid min-w-0 content-start gap-xs">
            <div className="max-h-[24rem] overflow-auto rounded-card border border-rule bg-paper">
              <img src={bringingIn.page} alt="The photographed lesson plan" className="w-full" />
            </div>
            <figcaption className="text-sm leading-ui text-ink-secondary">
              The page graspy read. Correct the words beside it against what is written here.
            </figcaption>
          </figure>
        ) : null}
        <TextArea
          id="lesson-raw-plan"
          labelText="Lesson plan text"
          required
          rows={18}
          value={text}
          onChange={(event) => onTextChange(event.currentTarget.value)}
        />
      </div>
    </section>
  );
}
