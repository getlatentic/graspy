import { describe, expect, it } from "vitest";

import { describeLaunchFailure, type LaunchFailureCode } from "./launchHealth";

const EVERY_CODE: readonly LaunchFailureCode[] = [
  "needs-app-update",
  "lesson-library-unavailable",
  "interrupted-work-unresolved",
  "source-material-unavailable",
  "included-content-unavailable",
  "startup-check-unavailable",
];

describe("describeLaunchFailure", () => {
  it("explains every launch failure graspy can report", () => {
    for (const code of EVERY_CODE) {
      const description = describeLaunchFailure({ code, detail: "detail" });

      expect(description.title.length).toBeGreaterThan(0);
      expect(description.explanation.length).toBeGreaterThan(0);
      expect(description.recovery.length).toBeGreaterThan(0);
    }
  });

  it("speaks to a teacher rather than about the implementation", () => {
    for (const code of EVERY_CODE) {
      const description = describeLaunchFailure({ code, detail: "detail" });
      const prose = [
        description.title,
        description.explanation,
        description.recovery,
      ].join(" ");

      expect(prose).not.toMatch(
        /database|sqlite|corpus|migration|schema|on-device|grounding|fixture|adapter/i,
      );
    }
  });

  it("tells a teacher what to do, not only what went wrong", () => {
    for (const code of EVERY_CODE) {
      expect(describeLaunchFailure({ code, detail: "detail" }).recovery).toMatch(
        /graspy|support/i,
      );
    }
  });

  it("keeps a teacher working when only the included curriculum is missing", () => {
    const description = describeLaunchFailure({
      code: "included-content-unavailable",
      detail: "a different curriculum file is already installed",
    });

    expect(description.blocksWorkspace).toBe(false);
  });

  it("withholds the workspace whenever nothing is safe to open", () => {
    for (const code of EVERY_CODE.filter((c) => c !== "included-content-unavailable")) {
      expect(describeLaunchFailure({ code, detail: "detail" }).blocksWorkspace).toBe(true);
    }
  });

  it("withholds a retry that cannot succeed", () => {
    const description = describeLaunchFailure({
      code: "needs-app-update",
      detail: "library version 25, this app supports up to 24",
    });

    expect(description.retryable).toBe(false);
  });

  it("offers a retry when running the work again can succeed", () => {
    expect(
      describeLaunchFailure({ code: "lesson-library-unavailable", detail: "" })
        .retryable,
    ).toBe(true);
  });
});
