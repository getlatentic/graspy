import { z } from "zod";

import { EVERY_WEEKDAY, weekdaySchema, type Weekday } from "./classTimetable";

/** A time of day on a school clock, as "HH:MM". */
export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** How long one period runs. A school picks one and the day follows from it. */
export const periodLengthSchema = z.union([z.literal(40), z.literal(45), z.literal(60)]);

export const schoolBreakSchema = z.object({
  /** The break comes after this many periods have been taught. */
  afterPeriod: z.number().int().positive(),
  minutes: z.number().int().min(5).max(120),
});

/**
 * The shape of a school day, from which its periods are worked out.
 *
 * A school states when it opens, when it closes, how long a period runs and
 * when it breaks — and the periods follow. They are never listed, because a
 * list would drift from the times beside it the first time a bell moved.
 */
export const schoolDaySchema = z.object({
  /** The days this school teaches on, in the order the week runs. */
  teachingDays: z.array(weekdaySchema).min(1),
  startsAt: clockTimeSchema,
  endsAt: clockTimeSchema,
  periodMinutes: periodLengthSchema,
  /** The short break, mid-morning. Absent when a school does not take one. */
  shortBreak: schoolBreakSchema.nullable(),
  /** The long break, around the middle of the day. */
  longBreak: schoolBreakSchema.nullable(),
});

export type ClockTime = z.infer<typeof clockTimeSchema>;
export type PeriodLength = z.infer<typeof periodLengthSchema>;
export type SchoolBreak = z.infer<typeof schoolBreakSchema>;
export type SchoolDay = z.infer<typeof schoolDaySchema>;

/** The day a Nigerian secondary school keeps, until its teacher says otherwise. */
export const DEFAULT_SCHOOL_DAY: SchoolDay = {
  teachingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  startsAt: "08:00",
  endsAt: "14:00",
  periodMinutes: 40,
  shortBreak: { afterPeriod: 2, minutes: 15 },
  longBreak: { afterPeriod: 5, minutes: 30 },
};

export const PERIOD_LENGTHS: readonly PeriodLength[] = [40, 45, 60];

/** One block of the day: a period a class can be taught in, or a break. */
export type DayBlock =
  | { readonly kind: "period"; readonly ordinal: number; readonly startsAt: ClockTime; readonly endsAt: ClockTime }
  | {
      readonly kind: "break";
      readonly name: BreakName;
      readonly startsAt: ClockTime;
      readonly endsAt: ClockTime;
      /** The period it follows, so a control can move it from the row it is on. */
      readonly afterPeriod: number;
      readonly minutes: number;
    };

/**
 * The day, block by block, in the order the bells go.
 *
 * Periods run back to back from the moment the school opens; a break takes its
 * place in the queue after the period it follows; and a period that would run
 * past closing is not a period, so how many a day holds is arithmetic rather
 * than a number anyone has to keep in step.
 */
export function dayBlocks(day: SchoolDay): DayBlock[] {
  const closesAt = minutesOf(day.endsAt);
  const breaks = [day.shortBreak, day.longBreak].filter(
    (value): value is SchoolBreak => value !== null,
  );
  const blocks: DayBlock[] = [];
  let at = minutesOf(day.startsAt);
  let ordinal = 1;

  while (at + day.periodMinutes <= closesAt) {
    blocks.push({
      kind: "period",
      ordinal,
      startsAt: clockOf(at),
      endsAt: clockOf(at + day.periodMinutes),
    });
    at += day.periodMinutes;
    for (const taken of breaks.filter(({ afterPeriod }) => afterPeriod === ordinal)) {
      if (at + taken.minutes > closesAt) break;
      blocks.push({
        kind: "break",
        name: taken === day.longBreak ? "longBreak" : "shortBreak",
        startsAt: clockOf(at),
        endsAt: clockOf(at + taken.minutes),
        afterPeriod: taken.afterPeriod,
        minutes: taken.minutes,
      });
      at += taken.minutes;
    }
    ordinal += 1;
  }
  return blocks;
}

/** Only the periods, for a screen that asks which of them a class is taught in. */
export function periodsOfDay(day: SchoolDay): Extract<DayBlock, { kind: "period" }>[] {
  return dayBlocks(day).filter((block) => block.kind === "period");
}

/** How many periods the day holds — the count no one has to keep in step. */
export function periodCount(day: SchoolDay): number {
  return periodsOfDay(day).length;
}

/** When a block of the day runs, as a teacher reads it off a timetable. */
export function blockClock(block: {
  readonly startsAt: ClockTime;
  readonly endsAt: ClockTime;
}): string {
  return `${block.startsAt}–${block.endsAt}`;
}

/**
 * What is wrong with a day a teacher has described, if anything is.
 *
 * Said in the terms they set it in, so the answer names the field to change
 * rather than the arithmetic that failed.
 */
export function schoolDayFault(day: SchoolDay): string | null {
  if (day.teachingDays.length === 0) {
    return "A school teaches on at least one day of the week.";
  }
  if (minutesOf(day.endsAt) <= minutesOf(day.startsAt)) {
    return "The school day must close after it opens.";
  }
  if (periodCount(day) === 0) {
    return `A ${day.periodMinutes}-minute period does not fit between ${day.startsAt} and ${day.endsAt}.`;
  }
  for (const taken of [day.shortBreak, day.longBreak]) {
    if (taken && taken.afterPeriod >= periodCount(day) + 1) {
      return `There is no period ${taken.afterPeriod} to break after. This day has ${periodCount(day)}.`;
    }
  }
  if (
    day.shortBreak &&
    day.longBreak &&
    day.shortBreak.afterPeriod === day.longBreak.afterPeriod
  ) {
    return "The two breaks cannot both come after the same period.";
  }
  return null;
}

function minutesOf(time: ClockTime): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function clockOf(minutes: number): ClockTime {
  const hours = Math.floor(minutes / 60) % 24;
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Which of the day's two breaks is being moved or taken out. */
export type BreakName = "shortBreak" | "longBreak";

export const BREAK_NAMES: readonly BreakName[] = ["shortBreak", "longBreak"];

export function breakLabel(name: BreakName): string {
  return name === "shortBreak" ? "Short break" : "Long break";
}

/**
 * The day with one break moved a period earlier or later, or null when it
 * cannot go.
 *
 * A break never leads the day — there is nothing to break after — and never
 * lands where the other one already is. Returning null rather than clamping is
 * what lets the control that offers the move be disabled instead of appearing
 * to work and doing nothing.
 */
export function withBreakMoved(
  day: SchoolDay,
  name: BreakName,
  by: -1 | 1,
): SchoolDay | null {
  const taken = day[name];
  if (!taken) return null;
  const afterPeriod = taken.afterPeriod + by;
  const other = day[name === "shortBreak" ? "longBreak" : "shortBreak"];
  if (afterPeriod < 1 || afterPeriod > periodCount(day)) return null;
  if (other && other.afterPeriod === afterPeriod) return null;
  return { ...day, [name]: { ...taken, afterPeriod } };
}

/** The day with one break taken out. */
export function withBreakRemoved(day: SchoolDay, name: BreakName): SchoolDay {
  return { ...day, [name]: null };
}

/** The day with one break put back, in the first gap it can hold. */
export function withBreakAdded(day: SchoolDay, name: BreakName): SchoolDay {
  const other = day[name === "shortBreak" ? "longBreak" : "shortBreak"];
  const middle = Math.max(1, Math.ceil(periodCount(day) / 2));
  const free = [middle, ...Array.from({ length: periodCount(day) }, (_, index) => index + 1)].find(
    (ordinal) => other?.afterPeriod !== ordinal,
  );
  if (!free) return day;
  return {
    ...day,
    [name]: { afterPeriod: free, minutes: name === "longBreak" ? 30 : 15 },
  };
}

/** The day with one break's length changed. */
export function withBreakMinutes(day: SchoolDay, name: BreakName, minutes: number): SchoolDay {
  const taken = day[name];
  return taken ? { ...day, [name]: { ...taken, minutes } } : day;
}

/** The school week in the order it runs, whichever days a school keeps. */
export function schoolWeek(day: SchoolDay): Weekday[] {
  return EVERY_WEEKDAY.filter((weekday) => day.teachingDays.includes(weekday));
}

/** The day with one weekday added to the week or taken out of it. */
export function withWeekdayToggled(day: SchoolDay, weekday: Weekday): SchoolDay {
  const teaching = day.teachingDays.includes(weekday)
    ? day.teachingDays.filter((taught) => taught !== weekday)
    : [...day.teachingDays, weekday];
  return { ...day, teachingDays: EVERY_WEEKDAY.filter((each) => teaching.includes(each)) };
}
