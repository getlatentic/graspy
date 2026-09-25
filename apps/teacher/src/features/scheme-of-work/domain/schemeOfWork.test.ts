import { describe, expect, it } from "vitest";

import {
  currentOrFirstTeachingWeek,
  lines,
  suggestedPeriodDates,
  type SchemeOfWork,
} from "./schemeOfWork";

describe("scheme-of-work domain", () => {
  it("suggests date bands from the selected session and term", () => {
    expect(suggestedPeriodDates(2026, 1, 3)).toEqual({
      startsOn: "2026-09-01",
      endsOn: "2026-12-31",
    });
    expect(suggestedPeriodDates(2026, 3, 3)).toEqual({
      startsOn: "2027-05-01",
      endsOn: "2027-08-31",
    });
  });

  it("turns one-line-per-item input into ordered values", () => {
    expect(lines(" First outcome \n\nSecond outcome\n")).toEqual([
      "First outcome",
      "Second outcome",
    ]);
  });

  it("selects the calendar week containing the local date", () => {
    const scheme = {
      weeks: [
        { id: "week-1", startsOn: "2026-09-01", endsOn: "2026-09-07", kind: "teaching" },
        { id: "week-2", startsOn: "2026-09-08", endsOn: "2026-09-14", kind: "teaching" },
      ],
    } as SchemeOfWork;

    expect(currentOrFirstTeachingWeek(scheme, new Date(2026, 8, 10)).id).toBe(
      "week-2",
    );
  });
});
