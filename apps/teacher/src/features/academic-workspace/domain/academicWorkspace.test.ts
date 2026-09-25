import { describe, expect, it } from "vitest";

import {
  defaultPeriodNames,
  inferAcademicContext,
  termStandingLabel,
} from "./academicWorkspace";

describe("inferAcademicContext", () => {
  it.each([
    [new Date(2026, 8, 1), 2026, 1],
    [new Date(2026, 11, 31), 2026, 1],
    [new Date(2027, 0, 1), 2026, 2],
    [new Date(2027, 3, 30), 2026, 2],
    [new Date(2027, 4, 1), 2026, 3],
    [new Date(2027, 7, 31), 2026, 3],
  ] as const)(
    "infers the September-start context for %s",
    (date, startYear, activePeriodOrdinal) => {
      expect(inferAcademicContext(date)).toEqual({ startYear, activePeriodOrdinal });
    },
  );

  it("supports a different academic-year start month deterministically", () => {
    expect(inferAcademicContext(new Date(2026, 6, 17), 3, 8)).toEqual({
      startYear: 2025,
      activePeriodOrdinal: 3,
    });
    expect(inferAcademicContext(new Date(2026, 7, 1), 3, 8)).toEqual({
      startYear: 2026,
      activePeriodOrdinal: 1,
    });
  });

  it("rejects an invalid academic-year start month", () => {
    expect(() => inferAcademicContext(new Date(2026, 6, 17), 3, 0)).toThrow(
      "between 1 and 12",
    );
  });

  it("builds teacher-facing names for each supported school calendar", () => {
    expect(defaultPeriodNames("terms")).toEqual([
      "First term",
      "Second term",
      "Third term",
    ]);
    expect(defaultPeriodNames("semesters")).toEqual([
      "First semester",
      "Second semester",
    ]);
    expect(defaultPeriodNames("quarters")).toHaveLength(4);
    expect(defaultPeriodNames("custom", 5)).toEqual([
      "Period 1",
      "Period 2",
      "Period 3",
      "Period 4",
      "Period 5",
    ]);
  });

  it("infers the current semester and quarter from the same date", () => {
    expect(inferAcademicContext(new Date(2027, 2, 1), 2)).toEqual({
      startYear: 2026,
      activePeriodOrdinal: 2,
    });
    expect(inferAcademicContext(new Date(2027, 2, 1), 4)).toEqual({
      startYear: 2026,
      activePeriodOrdinal: 3,
    });
  });
});

describe("where a term has got to", () => {
  /// A term whose weeks had all ended fell back to its first week and showed it
  /// as though it were now, so a card read "WEEK 1" eight months after the term
  /// closed.
  it("says the term is finished rather than naming its first week", () => {
    expect(termStandingLabel({ ordinal: 18, standing: "finished" })).toBe("Term finished");
  });

  it("names the week today falls in", () => {
    expect(termStandingLabel({ ordinal: 3, standing: "thisWeek" })).toBe("This week · Week 3");
  });

  it("says where a term that has not begun will start", () => {
    expect(termStandingLabel({ ordinal: 1, standing: "notStarted" })).toBe(
      "Term starts at Week 1",
    );
  });
});
