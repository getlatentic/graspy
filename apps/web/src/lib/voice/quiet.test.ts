import { afterEach, describe, expect, it, vi } from "vitest";
import { HOLD_LIMIT_MS, holdQuiet, isQuiet, onHold } from "./quiet";

afterEach(() => {
  vi.useRealTimers();
});

describe("quiet holds", () => {
  it("add up, and release once each however often released", () => {
    const first = holdQuiet();
    const second = holdQuiet();
    first();
    first();
    expect(isQuiet()).toBe(true);
    second();
    expect(isQuiet()).toBe(false);
  });

  it("tell the listeners as each is taken, until they stop listening", () => {
    const listener = vi.fn();
    const stop = onHold(listener);
    const release = holdQuiet();
    expect(listener).toHaveBeenCalledOnce();
    stop();
    holdQuiet()();
    expect(listener).toHaveBeenCalledOnce();
    release();
  });

  it("end by themselves, so a hold left over cannot mute the app for good", () => {
    vi.useFakeTimers();
    holdQuiet();
    expect(isQuiet()).toBe(true);
    vi.advanceTimersByTime(HOLD_LIMIT_MS - 1);
    expect(isQuiet()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isQuiet()).toBe(false);
  });

  it("outlast the longest take and the longest wait for a teacher's line", () => {
    expect(HOLD_LIMIT_MS).toBeGreaterThan(110_000 + 45_000);
  });
});
