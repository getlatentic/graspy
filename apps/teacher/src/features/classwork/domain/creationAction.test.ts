import { describe, expect, it } from "vitest";

import { creationAction } from "./creationAction";
import type { ClassworkWorkspaceSnapshot } from "./classwork";

type Run = NonNullable<ClassworkWorkspaceSnapshot["run"]>;

const run = (status: string, ...sections: string[]) =>
  ({ status, sections: sections.map((s, i) => ({ id: `s${i}`, status: s })) }) as Run;

describe("what the creation panel offers next", () => {
  it("offers to start when nothing has been written", () => {
    expect(creationAction({ run: null, queued: false })).toBe("start");
  });

  it("offers to stop while a section is being written", () => {
    expect(creationAction({ run: run("running", "done", "generating"), queued: false })).toBe("stop");
  });

  it("reports the wait when the engine has not reached it yet", () => {
    expect(creationAction({ run: run("running", "pending"), queued: true })).toBe("waiting");
  });

  it("offers to carry on when it stopped with sections left", () => {
    expect(creationAction({ run: run("paused", "done", "pending"), queued: false })).toBe("continue");
  });

  /// A failure is dealt with section by section, so carrying on past one is not
  /// offered until the teacher has attended to it.
  it("does not offer to carry on past a failure", () => {
    expect(creationAction({ run: run("failed", "failed", "pending"), queued: false })).toBeNull();
  });

  it("says a run the teacher stopped is stopped, and offers nothing", () => {
    expect(creationAction({ run: run("cancelled", "done"), queued: false })).toBe("stopped");
  });

  it("offers nothing once every section is written", () => {
    expect(creationAction({ run: run("complete", "done", "done"), queued: false })).toBeNull();
  });
});
