import { describe, expect, it } from "vitest";

import { generationActive } from "./classworkRun";
import type { ClassworkWorkspaceSnapshot } from "./classwork";

type Run = NonNullable<ClassworkWorkspaceSnapshot["run"]>;

const snapshot = (run: Partial<Run> | null): ClassworkWorkspaceSnapshot =>
  ({ lesson: {}, run: run === null ? null : ({ sections: [], ...run } as Run) }) as
    ClassworkWorkspaceSnapshot;

const sections = (...statuses: string[]) =>
  statuses.map((status, index) => ({ id: `s${index}`, status })) as Run["sections"];

describe("whether lesson instructionalMaterials are being created right now", () => {
  it("is not, when nothing has been started", () => {
    expect(generationActive(snapshot(null))).toBe(false);
  });

  it("is, while a run is going and sections are left to write", () => {
    expect(
      generationActive(snapshot({ status: "running", sections: sections("done", "generating") })),
    ).toBe(true);
    expect(
      generationActive(snapshot({ status: "running", sections: sections("done", "pending") })),
    ).toBe(true);
  });

  /// The defect this exists for: a stopped run leaves its unstarted sections
  /// pending, so reading the sections alone reported a failed run as working.
  /// That withheld the failed section's own retry behind "waiting for the work
  /// already running", leaving a Needs attention with no way to attend.
  it("is not, once the run has stopped, however many sections never ran", () => {
    for (const status of ["failed", "cancelled", "paused", "complete"] as const) {
      expect(
        generationActive(snapshot({ status, sections: sections("failed", "pending", "pending") })),
        status,
      ).toBe(false);
    }
  });

  /// Recreating one section is work of its own, and the run it belongs to has
  /// already finished.
  it("is, while a single section is being written again", () => {
    expect(
      generationActive(
        snapshot({
          status: "complete",
          sections: sections("done"),
          sectionRegeneration: { status: "generating" },
        } as Partial<Run>),
      ),
    ).toBe(true);
  });
});
