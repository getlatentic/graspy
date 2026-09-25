import { Button, InlineNotification, TextInput } from "@carbon/react";
import { type ChangeEvent, type FormEvent, useState } from "react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import {
  suggestedPeriodDates,
  type CreateSchemeFromTemplateRequest,
  type CreateSchemeOfWorkRequest,
  type SchemeTemplateSummary,
} from "../domain/schemeOfWork";
import { chosenTemplate, weekKindName } from "../domain/schemeTemplates";
import { SchemeSetup } from "./SchemeSetup";
import { eyebrow } from "../../../ui/chrome";

interface SchemeStartProps {
  readonly academicContext: ActiveAcademicContext;
  readonly sessionStartYear: number;
  readonly templates: SchemeTemplateSummary[];
  readonly pendingAction: string | null;
  readonly error: string | null;
  readonly onCreateManual: (
    request: Omit<CreateSchemeOfWorkRequest, "context">,
  ) => Promise<boolean>;
  readonly onCreateFromTemplate: (
    request: Omit<CreateSchemeFromTemplateRequest, "context">,
  ) => Promise<boolean>;
  readonly onImport: (packageContents: string) => Promise<boolean>;
}

export function SchemeStart({
  academicContext,
  sessionStartYear,
  templates,
  pendingAction,
  error,
  onCreateManual,
  onCreateFromTemplate,
  onImport,
}: SchemeStartProps) {
  const periodCount = academicContext.workspace.periods.filter(
    ({ academicSessionId }) => academicSessionId === academicContext.workspace.activeSessionId,
  ).length;
  const suggestedDates = suggestedPeriodDates(
    sessionStartYear,
    academicContext.period.ordinal,
    periodCount,
  );
  const [mode, setMode] = useState<"library" | "manual">("library");
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const [termStartsOn, setTermStartsOn] = useState(suggestedDates.startsOn);
  const [termEndsOn, setTermEndsOn] = useState(suggestedDates.endsOn);
  const [breakStartsOn, setBreakStartsOn] = useState("");
  const [breakEndsOn, setBreakEndsOn] = useState("");
  const sessionStartsOn = `${sessionStartYear}-09-01`;
  const sessionEndsOn = `${sessionStartYear + 1}-08-31`;

  if (mode === "manual") {
    return (
      <SchemeSetup
        academicContext={academicContext}
        sessionStartYear={sessionStartYear}
        pending={pendingAction === "create-scheme"}
        error={error}
        onCreate={onCreateManual}
        onBack={() => setMode("library")}
      />
    );
  }

  const selectedTemplate = chosenTemplate(templates, chosenTemplateId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTemplate) return;
    void onCreateFromTemplate({
      templateId: selectedTemplate.id,
      termStartsOn,
      termEndsOn,
      midTermBreakStartsOn: breakStartsOn || null,
      midTermBreakEndsOn: breakEndsOn || null,
    });
  };

  return (
    <main className="mx-auto min-h-full w-[min(100%,88rem)] px-lg pt-xl pb-3xl">
      <header className="mb-xl">
        <p className={eyebrow}>Scheme of work</p>
        <h1 className="m-0 min-w-0 font-display font-extrabold text-ink [overflow-wrap:anywhere] max-w-[19ch] tracking-[-0.035em] text-display leading-display">Start with a scheme your school uses.</h1>
        <p className="mt-sm mb-0 leading-body text-ink-secondary">
          {academicContext.assignment.displayName} · {academicContext.sessionLabel}
        </p>
      </header>

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Scheme not ready"
          subtitle={error}
        />
      ) : null}

      <form className="grid min-w-0 border-y border-rule-strong bg-paper min-[60rem]:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]" onSubmit={submit}>
        <section className="min-w-0 border-b border-rule p-lg min-[60rem]:border-b-0 min-[60rem]:border-e min-[60rem]:p-xl" aria-labelledby="scheme-library-heading">
          <div className="mb-lg flex flex-col items-start gap-md sm:flex-row sm:justify-between">
            <div>
              <h2 className="m-0 font-display font-extrabold tracking-[-0.025em] text-ink text-xl" id="scheme-library-heading">Available schemes</h2>
              <p className="mt-2xs mb-0 max-w-[60ch] leading-body text-ink-secondary">Only schemes matching this subject, class and term are shown.</p>
            </div>
            <ImportSchemeFile disabled={pendingAction !== null} onImport={onImport} />
          </div>

          {templates.length ? (
            <fieldset className="m-0 min-w-0 border-0 border-t border-rule p-0">
              <legend className="sr-only">Choose a scheme</legend>
              {templates.map((template) => (
                <label
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-md border-b border-rule px-sm py-lg hover:bg-paper-soft data-[selected=true]:bg-paper-soft data-[selected=true]:shadow-[inset_2px_0_0_var(--color-accent)] [&>input]:mt-[0.2rem] [&>input]:size-[1rem] [&>input]:accent-accent [&>span]:grid [&>span]:min-w-0 [&>span]:gap-2xs"
                  data-selected={template.id === selectedTemplate?.id}
                  key={template.id}
                >
                  <input
                    type="radio"
                    name="scheme-template"
                    value={template.id}
                    checked={template.id === selectedTemplate?.id}
                    onChange={() => setChosenTemplateId(template.id)}
                  />
                  <span>
                    <strong className="font-extrabold text-ink [overflow-wrap:anywhere]">{template.title}</strong>
                    <small className="leading-ui text-muted">
                      {template.publisher} · {template.edition} · {template.weekCount} weeks
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="grid min-h-[14rem] content-center border-y border-rule px-0 py-xl">
              <h3 className="m-0 font-display font-extrabold tracking-[-0.025em] text-ink">No matching schemes installed</h3>
              <p className="mt-2xs mb-0 max-w-[60ch] leading-body text-ink-secondary">
                Import a scheme supplied by your school, or build this term week by week.
              </p>
            </div>
          )}
        </section>

        <aside className="grid min-w-0 content-start gap-xl bg-paper-soft p-lg min-[60rem]:p-xl" aria-live="polite">
          {selectedTemplate ? (
            <TemplatePreview template={selectedTemplate} />
          ) : (
            <div>
              <p className={eyebrow}>Before you begin</p>
              <h2 className="m-0 font-display font-extrabold tracking-[-0.025em] text-ink text-xl">Your imported scheme stays editable.</h2>
              <p className="mt-2xs mb-0 max-w-[60ch] leading-body text-ink-secondary">graspy copies it into this class and term. The original file is not changed.</p>
            </div>
          )}

          {selectedTemplate ? (
            <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-md border-0 border-t border-rule p-0 pt-lg sm:grid-cols-2 [&>legend]:mb-md [&>legend]:p-0 [&>legend]:font-extrabold [&>legend]:text-ink sm:[&>legend]:col-span-full">
              <legend>Your term</legend>
              <TextInput
                id="template-term-starts-on"
                labelText="Resumption"
                type="date"
                required
                min={sessionStartsOn}
                max={termEndsOn || sessionEndsOn}
                value={termStartsOn}
                onChange={(event) => setTermStartsOn(event.currentTarget.value)}
              />
              <TextInput
                id="template-term-ends-on"
                labelText="Closing"
                type="date"
                required
                min={termStartsOn || sessionStartsOn}
                max={sessionEndsOn}
                value={termEndsOn}
                onChange={(event) => setTermEndsOn(event.currentTarget.value)}
              />
              {/* A term is not a straight run of weeks. Without this, a plan can
                  land in the week the school is shut. */}
              <TextInput
                id="template-break-starts-on"
                labelText="Mid-term break starts (optional)"
                type="date"
                min={termStartsOn || sessionStartsOn}
                max={breakEndsOn || termEndsOn || sessionEndsOn}
                value={breakStartsOn}
                onChange={(event) => setBreakStartsOn(event.currentTarget.value)}
              />
              <TextInput
                id="template-break-ends-on"
                labelText="Mid-term break ends (optional)"
                type="date"
                min={breakStartsOn || termStartsOn || sessionStartsOn}
                max={termEndsOn || sessionEndsOn}
                value={breakEndsOn}
                onChange={(event) => setBreakEndsOn(event.currentTarget.value)}
              />
            </fieldset>
          ) : null}

          <div className="grid gap-sm border-t border-rule pt-lg">
            {selectedTemplate ? (
              <Button
                type="submit"
                disabled={pendingAction !== null}
                className="min-h-[3rem] w-full max-w-none justify-center whitespace-nowrap rounded-none"
              >
                {pendingAction === "create-scheme-from-template"
                  ? "Preparing scheme…"
                  : "Use this scheme"}
              </Button>
            ) : null}
            <Button
              type="button"
              kind="ghost"
              disabled={pendingAction !== null}
              onClick={() => setMode("manual")}
            >
              Build my own
            </Button>
          </div>
        </aside>
      </form>
    </main>
  );
}

function TemplatePreview({ template }: { readonly template: SchemeTemplateSummary }) {
  return (
    <div>
      <p className={eyebrow}>Preview</p>
      <h2 className="m-0 font-display font-extrabold tracking-[-0.025em] text-ink text-xl">{template.title}</h2>
      <p className="mt-2xs mb-0 max-w-[60ch] leading-body text-ink-secondary">
        {template.publisher} · {template.jurisdiction}
      </p>
      <p className="m-0 mt-2xs text-sm font-bold text-muted">
        {template.trust === "verified"
          ? "Publisher verified by graspy"
          : template.origin === "bundled"
            ? "Included with graspy"
            : "Imported by this school"}
      </p>
      <ol className="mt-lg mb-0 max-h-[20rem] list-none overflow-y-auto p-0 [&_li]:grid [&_li]:gap-2xs [&_li]:border-t [&_li]:border-rule [&_li]:py-md [&_strong]:text-sm [&_strong]:text-ink [&_span]:text-sm [&_span]:text-ink-secondary">
        {template.weeks.map((week) => (
          <li key={week.ordinal}>
            <strong>
              Week {week.ordinal} · {week.title ?? weekKindName(week.kind)}
            </strong>
            {week.topics.length ? <span>{week.topics.join(" · ")}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Choosing a scheme file, and saying so when it cannot be read.
 *
 * The failure used to be reported in the page's banner, merged with the
 * workspace's own error by `??` — so a file that would not open was hidden
 * whenever anything else had already gone wrong, and reported far from the
 * control that caused it. A failure to read this file belongs beside it.
 */
function ImportSchemeFile({
  disabled,
  onImport,
}: {
  readonly disabled: boolean;
  /** Resolves false when the workspace refused it, which it reports itself. */
  readonly onImport: (packageContents: string) => Promise<boolean>;
}) {
  const [unreadable, setUnreadable] = useState(false);
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUnreadable(false);
    try {
      await onImport(await readFile(file));
    } catch {
      setUnreadable(true);
    }
  };
  return (
    <div className="grid gap-xs">
      <label className="relative inline-flex min-h-[2.5rem] cursor-pointer items-center border border-accent px-md text-sm font-bold text-accent hover:bg-paper-accent focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2 [&>input]:absolute [&>input]:h-px [&>input]:w-px [&>input]:opacity-0">
        Import scheme file
        <input
          type="file"
          accept=".graspy-scheme,application/json"
          onChange={(event) => void choose(event)}
          disabled={disabled}
        />
      </label>
      {unreadable ? (
        <p className="m-0 text-sm text-error" role="alert">
          That scheme file could not be read. Choose the original file and try again.
        </p>
      ) : null}
    </div>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}
