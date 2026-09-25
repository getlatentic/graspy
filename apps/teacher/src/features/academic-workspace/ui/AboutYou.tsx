import { Button, Select, SelectItem } from "@carbon/react";
import { FormActions } from "../../../ui/FormActions";
import { type FormEvent, useState } from "react";

import {
  defaultCalendarByCountry,
  defaultPeriodNames,
  inferAcademicContext,
  type AcademicWorkspaceSnapshot,
  type CreateAcademicWorkspaceRequest,
} from "../domain/academicWorkspace";
import { eyebrow } from "../../../ui/chrome";

interface AboutYouProps {
  readonly snapshot: AcademicWorkspaceSnapshot;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCreate: (request: CreateAcademicWorkspaceRequest) => Promise<boolean>;
}

/**
 * The one thing graspy has to ask before it can be useful.
 *
 * Everything else a workspace needs — the session, its terms, and which one is
 * running — follows from the date on this machine, and a teacher can correct
 * any of it later from the switcher. Asking for it here would put a school
 * calendar between a teacher and their first lesson.
 */
export function AboutYou({ snapshot, pending, error, onCreate }: AboutYouProps) {
  const [jurisdictionId, setJurisdictionId] = useState(
    snapshot.jurisdictions[0]?.id ?? "",
  );
  const [gradeBySubject, setGradeBySubject] = useState<Record<string, string>>({});

  const jurisdiction = snapshot.jurisdictions.find(({ id }) => id === jurisdictionId);
  const gradeSystem = snapshot.gradeSystems.find(
    (system) => system.jurisdictionId === jurisdictionId,
  );
  const gradeLevels = snapshot.gradeLevels.filter(
    (level) => level.gradeSystemId === gradeSystem?.id,
  );
  const chosen = Object.entries(gradeBySubject).filter(([, gradeLevelId]) => gradeLevelId);

  function toggleSubject(name: string) {
    setGradeBySubject((current) => {
      if (name in current) {
        const { [name]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [name]: "" };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const calendarKind =
      defaultCalendarByCountry[jurisdiction?.countryCode ?? ""] ?? "terms";
    const periodNames = defaultPeriodNames(calendarKind);
    const inferred = inferAcademicContext(new Date(), periodNames.length);
    void onCreate({
      startYear: inferred.startYear,
      jurisdictionId,
      gradeSystemId: gradeSystem?.id ?? "",
      calendarKind,
      periodNames,
      activePeriodOrdinal: inferred.activePeriodOrdinal,
      assignments: chosen.map(([subject, gradeLevelId]) => ({
        subject,
        gradeLevelId,
        classSection: null,
      })),
    });
  }

  return (
    <main className="grid min-h-dvh w-dvw max-w-full place-items-center bg-canvas p-lg text-ink max-[30rem]:px-sm max-[30rem]:py-md max-[30rem]:[place-items:start_center]">
      <section className="flex w-full max-w-[42rem] flex-col gap-md" aria-labelledby="about-you-title">
        <div className="flex gap-2xs" aria-hidden="true">
          <span className="h-[4px] w-[22px] rounded-[2px] bg-accent opacity-45" />
          <span className="h-[4px] w-[22px] rounded-[2px] bg-accent" />
        </div>
        <p className={eyebrow}>Last step</p>
        <h1 className="m-0 font-display text-xl leading-display text-ink" id="about-you-title">What do you teach?</h1>
        <p className="m-0 max-w-[68ch] text-base leading-reading text-ink-secondary">
          Pick your subjects and the class you teach each one to. Your school
          year and term are worked out from today&apos;s date — you can change
          them any time.
        </p>

        <form className="flex flex-col gap-lg" onSubmit={submit}>
          {snapshot.jurisdictions.length > 1 ? (
            <Select
              id="about-you-country"
              size="lg"
              labelText="Where do you teach?"
              value={jurisdictionId}
              onChange={(event) => {
                setJurisdictionId(event.currentTarget.value);
                setGradeBySubject({});
              }}
            >
              {snapshot.jurisdictions.map((option) => (
                <SelectItem key={option.id} value={option.id} text={option.country} />
              ))}
            </Select>
          ) : null}

          <fieldset className="m-0 flex flex-col gap-sm border-0 p-0 [&>legend]:p-0 [&>legend]:text-sm [&>legend]:font-semibold [&>legend]:text-ink">
            <legend>Your subjects</legend>
            <div className="flex flex-wrap gap-2xs">
              {snapshot.subjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className="min-h-[44px] cursor-pointer rounded-pill border border-rule-strong bg-paper px-md font-[inherit] text-sm text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-ink"
                  aria-pressed={subject.name in gradeBySubject}
                  onClick={() => toggleSubject(subject.name)}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </fieldset>

          {Object.keys(gradeBySubject).length > 0 ? (
            <fieldset className="m-0 flex flex-col gap-md border-0 p-0 [&>legend]:p-0 [&>legend]:text-sm [&>legend]:font-semibold [&>legend]:text-ink">
              <legend>Which class do you teach each one to?</legend>
              {Object.keys(gradeBySubject).map((subject) => (
                <Select
                  key={subject}
                  id={`about-you-grade-${subject.replace(/\s+/g, "-").toLowerCase()}`}
                  size="lg"
                  labelText={subject}
                  value={gradeBySubject[subject]}
                  onChange={(event) =>
                    setGradeBySubject((current) => ({
                      ...current,
                      [subject]: event.currentTarget.value,
                    }))
                  }
                >
                  <SelectItem value="" text="Choose a class" />
                  {gradeLevels.map((level) => (
                    <SelectItem
                      key={level.id}
                      value={level.id}
                      text={level.displayName}
                    />
                  ))}
                </Select>
              ))}
            </fieldset>
          ) : null}

          <FormActions failure={error ? { title: "Not saved", detail: error } : null}>
            <Button
              type="submit"
              size="lg"
              disabled={pending || chosen.length === 0}
              className="min-h-[3rem] w-full max-w-none rounded-none"
            >
              {pending ? "Setting up…" : "Continue"}
            </Button>
          </FormActions>
        </form>
      </section>
    </main>
  );
}
