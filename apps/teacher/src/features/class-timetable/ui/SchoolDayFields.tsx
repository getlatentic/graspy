import { Select, SelectItem, TextInput } from "@carbon/react";

import { EVERY_WEEKDAY, weekdayName } from "../domain/classTimetable";
import { withWeekdayToggled } from "../domain/schoolDay";
import {
  PERIOD_LENGTHS,
  periodCount,
  periodsOfDay,
  schoolDayFault,
  type PeriodLength,
  type SchoolDay,
} from "../domain/schoolDay";

/**
 * The shape of the school day, as the four things a school states about it.
 *
 * The periods are not asked for. A school says when it opens, when it closes
 * and how long a period runs, and how many periods that leaves is arithmetic —
 * so the line below says what the description came to rather than asking a
 * teacher to work it out and type it in. Where the breaks fall is asked on the
 * grid itself, on the row each one sits on.
 */
export function SchoolDayFields({
  day,
  onChange,
}: {
  readonly day: SchoolDay;
  readonly onChange: (day: SchoolDay) => void;
}) {
  const fault = schoolDayFault(day);

  return (
    <div className="grid gap-md">
      {/* Nearly every school teaches Monday to Friday, and the few that do not
          could not say so — a Saturday column shown to everyone to serve them
          would be an empty column on every screen. */}
      <fieldset className="m-0 grid gap-2xs border-0 p-0">
        <legend className="mb-2xs p-0 text-sm font-extrabold text-ink">Teaching days</legend>
        <div className="flex flex-wrap gap-2xs">
          {EVERY_WEEKDAY.map((weekday) => {
            const taught = day.teachingDays.includes(weekday);
            return (
              <button
                type="button"
                key={weekday}
                aria-pressed={taught}
                className={`min-h-[2.25rem] cursor-pointer rounded-card border px-sm text-sm focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                  taught
                    ? "border-accent bg-accent font-bold text-paper"
                    : "border-rule bg-paper text-ink-secondary hover:border-rule-strong"
                }`}
                onClick={() => onChange(withWeekdayToggled(day, weekday))}
              >
                {weekdayName(weekday).slice(0, 3)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-md sm:grid-cols-3">
        <TextInput
          id="school-day-starts-at"
          labelText="School opens"
          type="time"
          value={day.startsAt}
          onChange={(event) => onChange({ ...day, startsAt: event.currentTarget.value })}
        />
        <TextInput
          id="school-day-ends-at"
          labelText="School closes"
          type="time"
          value={day.endsAt}
          onChange={(event) => onChange({ ...day, endsAt: event.currentTarget.value })}
        />
        <Select
          id="school-day-period-minutes"
          labelText="A period runs for"
          value={String(day.periodMinutes)}
          onChange={(event) =>
            onChange({
              ...day,
              periodMinutes: Number(event.currentTarget.value) as PeriodLength,
            })
          }
        >
          {PERIOD_LENGTHS.map((minutes) => (
            <SelectItem key={minutes} value={String(minutes)} text={`${minutes} minutes`} />
          ))}
        </Select>
      </div>

      <p className="m-0 text-sm text-ink-secondary" role="status">
        {fault ?? dayShape(day)}
      </p>
    </div>
  );
}

/** What the description came to, said back so a teacher can check it. */
function dayShape(day: SchoolDay): string {
  const periods = periodsOfDay(day);
  const last = periods.at(-1);
  return `${periodCount(day)} periods, ${day.startsAt} to ${last?.endsAt ?? day.endsAt}.`;
}
