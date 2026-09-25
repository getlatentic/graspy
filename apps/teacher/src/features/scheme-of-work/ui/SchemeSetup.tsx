import { Button, TextInput } from "@carbon/react";
import { FormActions } from "../../../ui/FormActions";
import { type FormEvent, useState } from "react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import {
  suggestedPeriodDates,
  type CreateSchemeOfWorkRequest,
} from "../domain/schemeOfWork";
import { eyebrow } from "../../../ui/chrome";

interface SchemeSetupProps {
  readonly academicContext: ActiveAcademicContext;
  readonly sessionStartYear: number;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCreate: (
    request: Omit<CreateSchemeOfWorkRequest, "context">,
  ) => Promise<boolean>;
  readonly onBack?: () => void;
}

export function SchemeSetup({
  academicContext,
  sessionStartYear,
  pending,
  error,
  onCreate,
  onBack,
}: SchemeSetupProps) {
  const periodCount = academicContext.workspace.periods.filter(
    ({ academicSessionId }) => academicSessionId === academicContext.workspace.activeSessionId,
  ).length;
  const suggestedDates = suggestedPeriodDates(
    sessionStartYear,
    academicContext.period.ordinal,
    periodCount,
  );
  const [termStartsOn, setTermStartsOn] = useState(suggestedDates.startsOn);
  const [termEndsOn, setTermEndsOn] = useState(suggestedDates.endsOn);
  const [breakStartsOn, setBreakStartsOn] = useState("");
  const [breakEndsOn, setBreakEndsOn] = useState("");
  const sessionStartsOn = `${sessionStartYear}-09-01`;
  const sessionEndsOn = `${sessionStartYear + 1}-08-31`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCreate({
      termStartsOn,
      termEndsOn,
      midTermBreakStartsOn: breakStartsOn || null,
      midTermBreakEndsOn: breakEndsOn || null,
    });
  };

  return (
    <main className="mx-auto min-h-full w-[min(100%,76rem)] px-lg pt-xl pb-3xl">
      <header className="mb-xl">
        <p className={eyebrow}>Scheme of work</p>
        <h1 className="m-0 min-w-0 font-display font-extrabold text-ink [overflow-wrap:anywhere] max-w-[19ch] tracking-[-0.035em] text-display leading-display">Plan what you will teach each week.</h1>
        <p className="mt-sm mb-0 leading-body text-ink-secondary">
          {academicContext.assignment.displayName} · {academicContext.sessionLabel}
        </p>
      </header>

      {onBack ? (
        <Button type="button" kind="ghost" onClick={onBack}>
          Back to available schemes
        </Button>
      ) : null}

      <form className="grid gap-xl [&_.cds--label]:font-bold [&_.cds--label]:text-ink-secondary [&_.cds--text-input]:border-b-rule-strong [&_.cds--text-input]:bg-paper-soft [&_.cds--text-input]:text-ink border border-rule bg-paper p-lg min-[60rem]:p-xl [&_fieldset]:m-0 [&_fieldset]:grid [&_fieldset]:min-w-0 [&_fieldset]:gap-lg [&_fieldset]:border-0 [&_fieldset]:border-b [&_fieldset]:border-rule [&_fieldset]:p-0 [&_fieldset]:pb-xl [&_legend]:p-0 [&_legend]:text-md [&_legend]:font-extrabold [&_legend]:text-ink [&_fieldset>p]:m-0 [&_fieldset>p]:max-w-[65ch] [&_fieldset>p]:leading-body [&_fieldset>p]:text-ink-secondary" onSubmit={submit}>
        <section className="grid gap-2xs border-s-2 border-accent bg-paper-accent p-md [&_strong]:text-md [&_strong]:text-ink [&_span]:text-ink-secondary" aria-label="Selected curriculum">
          <p className={eyebrow}>Selected curriculum</p>
          <strong>{academicContext.assignment.curriculumTitle}</strong>
          <span>{academicContext.assignment.curriculumPublisher}</span>
        </section>

        <fieldset>
          <legend>Term dates</legend>
          <p>
            Check these dates against your school calendar before creating the
            weekly plan.
          </p>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg sm:grid-cols-2">
            <TextInput
              id="term-starts-on"
              labelText="Resumption"
              type="date"
              required
              min={sessionStartsOn}
              max={termEndsOn || sessionEndsOn}
              value={termStartsOn}
              onChange={(event) => setTermStartsOn(event.currentTarget.value)}
            />
            <TextInput
              id="term-ends-on"
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
              id="break-starts-on"
              labelText="Mid-term break starts (optional)"
              type="date"
              min={termStartsOn || sessionStartsOn}
              max={breakEndsOn || termEndsOn || sessionEndsOn}
              value={breakStartsOn}
              onChange={(event) => setBreakStartsOn(event.currentTarget.value)}
            />
            <TextInput
              id="break-ends-on"
              labelText="Mid-term break ends (optional)"
              type="date"
              min={breakStartsOn || termStartsOn || sessionStartsOn}
              max={termEndsOn || sessionEndsOn}
              value={breakEndsOn}
              onChange={(event) => setBreakEndsOn(event.currentTarget.value)}
            />
          </div>
        </fieldset>

        <FormActions failure={error ? { title: "Scheme not created", detail: error } : null}>
          <Button type="submit" disabled={pending} className="min-h-[3rem] w-full max-w-none justify-center whitespace-nowrap rounded-none">
            {pending ? "Creating scheme…" : "Create weekly scheme"}
          </Button>
        </FormActions>
      </form>
    </main>
  );
}
