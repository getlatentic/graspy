import { useState } from "react";
import { Button } from "@carbon/react";

import type { ClassTimetableGateway } from "../application/ClassTimetableGateway";
import type { SchoolDay } from "../domain/schoolDay";
import { periodCount } from "../domain/schoolDay";
import { ClassTimetableEditor } from "./ClassTimetableEditor";
import { SchoolDayFields } from "./SchoolDayFields";
import { useClassTimetable, useSchoolDay } from "./useClassTimetable";
import { FormActions } from "../../../ui/FormActions";
import { eyebrow } from "../../../ui/chrome";

interface TimetableClass {
  readonly id: string;
  readonly displayName: string;
}

/**
 * The teacher's timetable, one class at a time.
 *
 * A term's timetable is per class, so the screen is a class to work on and the
 * grid for it. Which class is being set is this screen's own business — nothing
 * else on it changes with the choice.
 */
export function ClassTimetableWorkspace({
  gateway,
  context,
  classes,
  termName,
  onDone,
}: {
  readonly gateway: ClassTimetableGateway;
  readonly context: {
    readonly academicSessionId: string;
    readonly academicPeriodId: string;
  };
  readonly classes: readonly TimetableClass[];
  readonly termName: string;
  readonly onDone: () => void;
}) {
  const [chosenId, setChosenId] = useState(classes[0]?.id ?? "");
  const chosen = classes.find(({ id }) => id === chosenId) ?? classes[0] ?? null;
  const schoolDay = useSchoolDay(gateway);

  return (
    <main className="mx-auto grid w-[min(100%,60rem)] content-start gap-lg px-lg pt-lg pb-3xl">
      <header>
        <p className={eyebrow}>Timetable</p>
        <h1 className="m-0 font-display text-display font-light leading-display tracking-[-0.01em] text-ink">
          When you teach
        </h1>
        <p className="m-0 mt-2xs text-ink-secondary">
          {termName} · graspy uses this to say what you are teaching next.
        </p>
      </header>

      <SchoolDayPanel
        day={schoolDay.day}
        described={schoolDay.described}
        saving={schoolDay.saving}
        error={schoolDay.error}
        onSave={schoolDay.save}
      />

      {chosen ? (
        <>
          <nav aria-label="Your classes">
            <ul className="m-0 flex list-none flex-wrap gap-xs p-0">
              {classes.map((teachingClass) => (
                <li key={teachingClass.id}>
                  <button
                    type="button"
                    aria-current={teachingClass.id === chosen.id ? "true" : undefined}
                    className={`min-h-[2.75rem] cursor-pointer rounded-card border px-md text-sm focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                      teachingClass.id === chosen.id
                        ? "border-accent bg-paper-accent font-bold text-ink"
                        : "border-rule bg-paper text-ink-secondary hover:border-rule-strong"
                    }`}
                    onClick={() => setChosenId(teachingClass.id)}
                  >
                    {teachingClass.displayName}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <ClassGrid
            key={chosen.id}
            gateway={gateway}
            context={context}
            day={schoolDay.day}
            teachingClass={chosen}
            onDone={onDone}
            onChangeDay={(day) => void schoolDay.save(day)}
          />
        </>
      ) : (
        <p className="m-0 text-ink-secondary">Add a class before setting a timetable.</p>
      )}
    </main>
  );
}

/**
 * One class's grid. Keyed on the class so switching starts a fresh load rather
 * than showing the last class's periods while the next one arrives.
 */
function ClassGrid({
  gateway,
  context,
  day,
  teachingClass,
  onDone,
  onChangeDay,
}: {
  readonly gateway: ClassTimetableGateway;
  readonly context: {
    readonly academicSessionId: string;
    readonly academicPeriodId: string;
  };
  readonly day: SchoolDay;
  readonly teachingClass: TimetableClass;
  readonly onDone: () => void;
  readonly onChangeDay: (day: SchoolDay) => void;
}) {
  const { slots, loading, saving, error, save } = useClassTimetable(
    gateway,
    context,
    teachingClass.id,
  );
  if (loading) return <p className="m-0 text-ink-secondary">Opening your timetable…</p>;
  return (
    <ClassTimetableEditor
      className={teachingClass.displayName}
      day={day}
      onChangeDay={onChangeDay}
      slots={slots}
      pending={saving}
      error={error}
      onCancel={onDone}
      onSave={(chosen) => {
        void save(chosen).then((saved) => {
          if (saved) onDone();
        });
      }}
    />
  );
}

/**
 * The shape of the school day, folded away until a teacher wants to change it.
 *
 * The grid below is built from this, so it opens by itself the first time — a
 * teacher whose day is not eight forty-minute periods should meet the question
 * before they meet a grid that assumes it is.
 */
function SchoolDayPanel({
  day,
  described,
  saving,
  error,
  onSave,
}: {
  readonly day: SchoolDay;
  readonly described: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onSave: (day: SchoolDay) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState(day);
  const editing = open || !described;

  if (!editing) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-md border border-rule bg-paper px-md py-sm">
        <p className="m-0 text-ink-secondary">
          Your day: {day.startsAt}–{day.endsAt}, {day.periodMinutes}-minute periods,{" "}
          {periodCount(day)} a day.
        </p>
        <Button
          kind="ghost"
          size="sm"
          onClick={() => {
            setEdited(day);
            setOpen(true);
          }}
        >
          Change the day
        </Button>
      </section>
    );
  }

  return (
    <section
      className="grid gap-md border border-rule bg-paper p-md"
      aria-labelledby="school-day-title"
    >
      <div>
        <h2 className="m-0 text-md leading-heading text-ink" id="school-day-title">
          What does your school day look like?
        </h2>
        <p className="m-0 mt-2xs text-ink-secondary">
          The periods below the grid come from this, so it is worth getting right once.
        </p>
      </div>
      <SchoolDayFields day={edited} onChange={setEdited} />
      <FormActions failure={error ? { title: "School day not saved", detail: error } : null}>
        <Button
          disabled={saving}
          onClick={() => {
            void onSave(edited).then((saved) => {
              if (saved) setOpen(false);
            });
          }}
        >
          {saving ? "Saving…" : "Save the school day"}
        </Button>
        {described ? (
          <Button kind="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        ) : null}
      </FormActions>
    </section>
  );
}
