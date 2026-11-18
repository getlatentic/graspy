import { describe, expect, it } from "vitest";
import { RELOAD_GAP_MS, shouldReload } from "./app-update";

describe("shouldReload", () => {
  it("reloads a page the learner has not touched", () => {
    expect(shouldReload({ touched: false, now: 1000, lastReload: null })).toBe(
      true,
    );
  });

  it("leaves a page in use alone", () => {
    expect(shouldReload({ touched: true, now: 1000, lastReload: null })).toBe(
      false,
    );
  });

  it("does not reload again straight after a reload for an update", () => {
    const now = 100_000;
    expect(
      shouldReload({ touched: false, now, lastReload: now - RELOAD_GAP_MS }),
    ).toBe(false);
    expect(
      shouldReload({
        touched: false,
        now,
        lastReload: now - RELOAD_GAP_MS - 1,
      }),
    ).toBe(true);
  });
});
