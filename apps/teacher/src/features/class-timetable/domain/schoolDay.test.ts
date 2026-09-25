import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHOOL_DAY,
  dayBlocks,
  blockClock,
  periodCount,
  periodsOfDay,
  schoolDayFault,
  withBreakAdded,
  withBreakMinutes,
  withBreakMoved,
  withBreakRemoved,
  type SchoolDay,
} from "./schoolDay";

function day(overrides: Partial<SchoolDay> = {}): SchoolDay {
  return { ...DEFAULT_SCHOOL_DAY, ...overrides };
}

describe("the day a school keeps", () => {
  /// The whole point of describing a day rather than listing periods: the times
  /// come out of the description, so a bell that moves moves everything with it.
  it("runs the periods back to back from the moment the school opens", () => {
    const [first, second] = periodsOfDay(day());

    expect(blockClock(first!)).toBe("08:00–08:40");
    expect(blockClock(second!)).toBe("08:40–09:20");
  });

  it("takes each break after the period it follows", () => {
    const blocks = dayBlocks(day());

    expect(blocks.slice(0, 4).map((block) => [block.kind, block.startsAt, block.endsAt])).toEqual([
      ["period", "08:00", "08:40"],
      ["period", "08:40", "09:20"],
      ["break", "09:20", "09:35"],
      ["period", "09:35", "10:15"],
    ]);
    expect(blocks.find((block) => block.kind === "break" && block.name === "longBreak")).toEqual({
      kind: "break",
      name: "longBreak",
      startsAt: "11:35",
      endsAt: "12:05",
      afterPeriod: 5,
      minutes: 30,
    });
  });

  /// 08:00 to 14:00 with forty-minute periods and forty-five minutes of break
  /// is seven periods, not eight. Nobody should have to work that out, and a
  /// grid of eight rows would have had a teacher tapping one that does not run.
  it("holds only the periods that finish before the school closes", () => {
    expect(periodCount(day())).toBe(7);
    expect(periodsOfDay(day()).at(-1)).toEqual({
      kind: "period",
      ordinal: 7,
      startsAt: "12:45",
      endsAt: "13:25",
    });
  });

  it("gives a longer period a shorter day", () => {
    expect(periodCount(day({ periodMinutes: 60 }))).toBe(5);
    expect(periodCount(day({ periodMinutes: 45 }))).toBe(7);
  });

  it("numbers the periods without counting the breaks", () => {
    expect(periodsOfDay(day()).map(({ ordinal }) => ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the day whole when a school takes no break at all", () => {
    const straight = day({ shortBreak: null, longBreak: null });

    expect(periodCount(straight)).toBe(9);
    expect(dayBlocks(straight).every((block) => block.kind === "period")).toBe(true);
  });

  /// A break with no room left before closing is not squeezed in; the day just
  /// ends, which is what a school does.
  it("does not run a break past the end of the day", () => {
    const blocks = dayBlocks(
      day({ endsAt: "09:20", shortBreak: { afterPeriod: 2, minutes: 15 }, longBreak: null }),
    );

    expect(blocks.map((block) => block.kind)).toEqual(["period", "period"]);
  });
});

describe("moving a break through the day", () => {
  /// A break never leads the day: there is nothing to break after. The control
  /// that offers the move is disabled rather than doing nothing, which is why
  /// this answers null instead of clamping.
  it("will not put a break before the first period", () => {
    const first = day({ shortBreak: { afterPeriod: 1, minutes: 15 } });
    expect(withBreakMoved(first, "shortBreak", -1)).toBeNull();
    expect(withBreakMoved(first, "shortBreak", 1)?.shortBreak?.afterPeriod).toBe(2);
  });

  it("will not run a break past the last period of the day", () => {
    const straight = day({ shortBreak: null });
    const last = day({
      shortBreak: null,
      longBreak: { afterPeriod: periodCount(straight), minutes: 30 },
    });
    expect(withBreakMoved(last, "longBreak", 1)).toBeNull();
    expect(withBreakMoved(last, "longBreak", -1)).not.toBeNull();
  });

  it("will not move one break onto the other", () => {
    const together = day({
      shortBreak: { afterPeriod: 2, minutes: 15 },
      longBreak: { afterPeriod: 3, minutes: 30 },
    });
    expect(withBreakMoved(together, "shortBreak", 1)).toBeNull();
    expect(withBreakMoved(together, "longBreak", -1)).toBeNull();
  });

  it("takes a break out and puts one back where the day has room", () => {
    const without = withBreakRemoved(day(), "longBreak");
    expect(without.longBreak).toBeNull();
    expect(periodCount(without)).toBe(8);

    const back = withBreakAdded(without, "longBreak");
    expect(back.longBreak).not.toBeNull();
    expect(back.longBreak?.afterPeriod).not.toBe(back.shortBreak?.afterPeriod);
  });

  it("changes how long a break runs without moving it", () => {
    const longer = withBreakMinutes(day(), "shortBreak", 25);
    expect(longer.shortBreak).toEqual({ afterPeriod: 2, minutes: 25 });
  });
});

describe("what is wrong with a day a teacher described", () => {
  it("says nothing about a day that works", () => {
    expect(schoolDayFault(day())).toBeNull();
  });

  it("names the closing time when it comes before the opening one", () => {
    expect(schoolDayFault(day({ startsAt: "14:00", endsAt: "08:00" }))).toBe(
      "The school day must close after it opens.",
    );
  });

  it("says which period length does not fit, rather than showing an empty grid", () => {
    expect(schoolDayFault(day({ startsAt: "08:00", endsAt: "08:30", periodMinutes: 60 }))).toBe(
      "A 60-minute period does not fit between 08:00 and 08:30.",
    );
  });

  it("says how many periods the day has when a break comes after one it does not", () => {
    expect(schoolDayFault(day({ longBreak: { afterPeriod: 9, minutes: 30 } }))).toBe(
      "There is no period 9 to break after. This day has 8.",
    );
  });

  it("refuses two breaks in the same gap", () => {
    expect(
      schoolDayFault(
        day({
          shortBreak: { afterPeriod: 3, minutes: 15 },
          longBreak: { afterPeriod: 3, minutes: 30 },
        }),
      ),
    ).toBe("The two breaks cannot both come after the same period.");
  });
});
