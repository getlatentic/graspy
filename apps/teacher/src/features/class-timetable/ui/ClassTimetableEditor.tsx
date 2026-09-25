import { useState } from "react";
import { Button } from "@carbon/react";

import { FormActions } from "../../../ui/FormActions";
import {
  isTaught,
  timetableSummary,
  toggleSlot,
  weekdayName,
  type TeachingSlot,
  type Weekday,
} from "../domain/classTimetable";
import {
  BREAK_NAMES,
  blockClock,
  breakLabel,
  dayBlocks,
  schoolWeek,
  withBreakAdded,
  withBreakMinutes,
  withBreakMoved,
  withBreakRemoved,
  type DayBlock,
  type SchoolDay,
} from "../domain/schoolDay";

/**
 * When this class is taught, on the week its school actually keeps.
 *
 * The rows are the periods worked out from the shape of the day, so they carry
 * the times a teacher reads off their own timetable and there are exactly as
 * many as the day holds. Its breaks are drawn where they fall — a row nobody
 * can tap is what tells a teacher this grid is their day and not a form.
 */
export function ClassTimetableEditor({
  className,
  day,
  slots,
  pending,
  error,
  onCancel,
  onSave,
  onChangeDay,
}: {
  readonly className: string;
  readonly day: SchoolDay;
  readonly slots: readonly TeachingSlot[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onSave: (slots: readonly TeachingSlot[]) => void;
  /** A break is moved and taken out on the row it sits on, not in a form. */
  readonly onChangeDay: (day: SchoolDay) => void;
}) {
  const [chosen, setChosen] = useState<readonly TeachingSlot[]>(slots);
  const missing = BREAK_NAMES.filter((name) => day[name] === null);
  const week = schoolWeek(day);

  return (
    <section className="grid gap-md" aria-labelledby="timetable-title">
      <div>
        <h2 className="sr-only" id="timetable-title">
          When do you teach {className}?
        </h2>
        <p className="m-0 text-ink-secondary">
          Tap every period you teach {className}. The same week runs all term.{" "}
          {timetableSummary(chosen)}.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">
            The periods of the school week, with the ones you teach {className} marked
          </caption>
          <thead>
            <tr>
              <th className="p-xs text-start font-extrabold text-ink" scope="col">
                Period
              </th>
              {week.map((weekday) => (
                <th className="p-xs font-extrabold text-ink" key={weekday} scope="col">
                  {weekdayName(weekday).slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayBlocks(day).map((block) => {
              if (block.kind === "break") {
                return (
                  <BreakRow
                    block={block}
                    day={day}
                    key={`break-${block.name}`}
                    onChangeDay={onChangeDay}
                    week={week}
                  />
                );
              }
              return (
                <PeriodRow
                  block={block}
                  chosen={chosen}
                  key={`period-${block.ordinal}`}
                  onToggle={(weekday) => setChosen(toggleSlot(chosen, weekday, block.ordinal))}
                  week={week}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {missing.length > 0 ? (
        <div className="flex flex-wrap gap-xs">
          {missing.map((name) => (
            <Button
              key={name}
              kind="ghost"
              size="sm"
              onClick={() => onChangeDay(withBreakAdded(day, name))}
            >
              Add a {breakLabel(name).toLowerCase()}
            </Button>
          ))}
        </div>
      ) : null}

      <FormActions failure={error ? { title: "Timetable not saved", detail: error } : null}>
        <Button disabled={pending} onClick={() => onSave(chosen)}>
          {pending ? "Saving…" : "Save the timetable"}
        </Button>
        <Button kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </FormActions>
    </section>
  );
}

function PeriodRow({
  block,
  chosen,
  onToggle,
  week,
}: {
  readonly block: Extract<DayBlock, { kind: "period" }>;
  readonly chosen: readonly TeachingSlot[];
  readonly onToggle: (weekday: Weekday) => void;
  readonly week: readonly Weekday[];
}) {
  return (
    <tr>
      {/* The number and the clock stay one text run: a flex row between them
          would drop the space out of the name a screen reader reads. */}
      <th className="py-xs pe-md text-start align-middle font-normal" scope="row">
        <span className="me-xs font-extrabold text-ink">{block.ordinal}</span>{" "}
        <span className="whitespace-nowrap tabular-nums text-ink-secondary">
          {blockClock(block)}
        </span>
      </th>
      {week.map((weekday) => {
        const taught = isTaught(chosen, weekday, block.ordinal);
        return (
          <td className="p-[2px]" key={weekday}>
            <button
              type="button"
              aria-pressed={taught}
              className={`flex min-h-[2.25rem] w-full min-w-[2.5rem] cursor-pointer items-center justify-center rounded-card border text-sm focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                taught
                  ? "border-accent bg-accent font-bold text-paper"
                  : "border-rule bg-paper text-muted hover:border-rule-strong"
              }`}
              onClick={() => onToggle(weekday)}
            >
              <span className="sr-only">
                {weekdayName(weekday)} period {block.ordinal}
                {taught ? " — taught" : " — not taught"}
              </span>
              <span aria-hidden="true">{taught ? "✓" : ""}</span>
            </button>
          </td>
        );
      })}
    </tr>
  );
}

/**
 * A break, on the row of the day it falls on.
 *
 * It is nobody's teaching period, so no square is offered — but it is moved and
 * taken out here rather than in a form above the grid, because where it sits is
 * a fact about the day a teacher is looking at.
 */
function BreakRow({
  block,
  day,
  onChangeDay,
  week,
}: {
  readonly block: Extract<DayBlock, { kind: "break" }>;
  readonly day: SchoolDay;
  readonly onChangeDay: (day: SchoolDay) => void;
  readonly week: readonly Weekday[];
}) {
  const label = breakLabel(block.name);
  const move = (by: -1 | 1) => withBreakMoved(day, block.name, by);
  return (
    <tr>
      <th className="py-xs pe-md text-start font-normal align-middle" scope="row">
        <span className="whitespace-nowrap tabular-nums text-ink-secondary">
          {blockClock(block)}
        </span>
      </th>
      <td className="p-[2px]" colSpan={week.length}>
        <div className="flex min-h-[2.25rem] flex-wrap items-center justify-between gap-x-md gap-y-2xs rounded-card bg-paper-soft px-sm">
          <span className="text-sm font-semibold text-ink-secondary">{label}</span>
          <span className="flex items-center gap-2xs">
            <label className="flex items-center gap-2xs text-sm text-muted">
              <span>Minutes</span>
              <input
                type="number"
                min={5}
                max={120}
                value={block.minutes}
                aria-label={`${label} minutes`}
                className="w-[3.5rem] border-0 border-b border-rule-strong bg-transparent px-2xs py-3xs text-center tabular-nums text-ink [font:inherit] focus-visible:outline-2 focus-visible:outline-focus"
                onChange={(event) =>
                  onChangeDay(
                    withBreakMinutes(day, block.name, Number(event.currentTarget.value) || block.minutes),
                  )
                }
              />
            </label>
            <MoveBreak label={`Move ${label.toLowerCase()} earlier`} glyph="↑" to={move(-1)} onChangeDay={onChangeDay} />
            <MoveBreak label={`Move ${label.toLowerCase()} later`} glyph="↓" to={move(1)} onChangeDay={onChangeDay} />
            <button
              type="button"
              aria-label={`Remove the ${label.toLowerCase()}`}
              className={breakControl}
              onClick={() => onChangeDay(withBreakRemoved(day, block.name))}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </span>
        </div>
      </td>
    </tr>
  );
}

/**
 * One step through the day for a break. Disabled where it cannot go — before
 * the first period, past the last, or onto the other break — so the control
 * says so rather than appearing to work.
 */
function MoveBreak({
  label,
  glyph,
  to,
  onChangeDay,
}: {
  readonly label: string;
  readonly glyph: string;
  readonly to: SchoolDay | null;
  readonly onChangeDay: (day: SchoolDay) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={to === null}
      className={breakControl}
      onClick={() => to && onChangeDay(to)}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

const breakControl =
  "grid size-[1.75rem] cursor-pointer place-items-center rounded-card border-0 bg-transparent text-ink-secondary hover:bg-paper hover:text-ink disabled:cursor-default disabled:text-rule-strong disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-1";
